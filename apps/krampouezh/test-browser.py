"""Browser regressions. Run against a local Krampouezh server (see README).

KRAMP_BASE_URL defaults to http://127.0.0.1:5080. Set CHROMIUM_EXECUTABLE
to use an installed Chromium, or let Playwright use its downloaded browser.
Pass --mock-only to exercise the UI against a static HTTP server.
"""

import asyncio
import json
import os
import re
import sys
import uuid

from playwright.async_api import async_playwright, expect


BASE_URL = os.environ.get("KRAMP_BASE_URL", "http://127.0.0.1:5080")
API = "**/api/leaderboard*"


async def fulfill(route, payload, status=200):
    await route.fulfill(status=status, content_type="application/json", body=json.dumps(payload))


async def finish_game(page, perfects=1):
    """Use the real scoring/drop logic, positioning crepes without timing races."""
    if await page.evaluate("state") == "title":
        await page.locator("#play").click()
    elif await page.evaluate("state") == "over":
        await page.locator("#replay").click()
    await page.evaluate("""count => {
      for (let i = 0; i < count; i++) {
        current.x = stack[stack.length - 1].x;
        drop();
      }
      current.x = W * 2;
      drop();
    }""", perfects)
    await expect(page.locator("#over-screen")).to_be_visible()
    await expect(page.locator("#replay")).to_be_enabled()


async def open_board(page):
    await page.locator(".overlay.visible [data-leaderboard]").click()
    await expect(page.locator("#leaderboard")).to_be_visible()


async def empty_and_errors(page):
    failure = None

    async def handle(route):
        if failure == "network":
            await route.abort("failed")
        else:
            await fulfill(route, {"entries": [], "total": 0, "rank": None}, 503 if failure else 200)

    await page.route(API, handle)
    await page.goto(BASE_URL)
    await open_board(page)
    await expect(page.locator("#leaderboard-status")).to_contain_text("Aucun score")
    await expect(page.locator("#player-rank")).to_be_hidden()
    failure = "http"
    await page.locator("#refresh-leaderboard").click()
    await expect(page.locator("#leaderboard-status")).to_contain_text("indisponible")
    failure = "network"
    await page.locator("#refresh-leaderboard").click()
    await expect(page.locator("#leaderboard-status")).to_contain_text("Connexion impossible")
    failure = None
    await page.locator("#refresh-leaderboard").click()
    await expect(page.locator("#leaderboard-status")).to_contain_text("Aucun score")
    await page.locator("#close-leaderboard").focus()
    await page.keyboard.press("Enter")
    await expect(page.locator("#leaderboard")).not_to_be_visible()
    assert await page.evaluate("state") == "title"


async def save_retry_and_keyboard(page):
    submissions = []

    async def handle(route):
        if route.request.method == "POST":
            submissions.append(route.request.post_data_json)
            if len(submissions) == 1:
                await fulfill(route, {}, 503)
                return
        entry = submissions[-1] if submissions else None
        await fulfill(route, {"entries": [entry] if entry else [], "total": int(entry is not None), "rank": 1 if entry else None})

    await page.route(API, handle)
    await page.goto(BASE_URL)
    await finish_game(page)
    await page.locator("#player-name").fill("Test")
    await page.locator("#player-name").press("Space")
    await page.locator("#player-name").press_sequentially("Breton")
    await expect(page.locator("#player-name")).to_have_value("Test Breton")
    await expect(page.locator("#over-screen .big-score")).to_have_text("2")
    await page.locator("#player-name").press("Enter")
    await expect(page.locator("#submit-status")).to_contain_text("peut être renvoyé")
    assert await page.evaluate("state") == "over"
    await page.locator("#submit-score").click()
    await expect(page.locator("#submit-status")).to_contain_text("1er sur 1 score")
    await expect(page.locator("#score-form")).to_be_hidden()
    assert len(submissions) == 2 and submissions[0] == submissions[1]
    assert submissions[0]["score"] == 2 and submissions[0]["name"] == "Test Breton"
    await page.reload()
    await open_board(page)
    await expect(page.locator("#player-rank")).to_contain_text("1er sur 1 score")
    await expect(page.locator("#leaderboard-list .own-score")).to_have_count(1)
    await page.locator("#close-leaderboard").click()
    await finish_game(page)
    await expect(page.locator("#player-name")).to_have_value("Test Breton")


async def outside_top100_and_mobile(page):
    own_id = str(uuid.uuid4())
    entries = [{"id": str(uuid.uuid4()), "name": "<img src=x>" if i == 0 else f"Joueur {i + 1}", "score": 200 - i} for i in range(100)]
    await page.add_init_script(f"localStorage.setItem('krampouezh-entry', '{own_id}')")

    async def handle(route):
        assert f"id={own_id}" in route.request.url
        await fulfill(route, {"entries": entries, "total": 102, "rank": 101})

    await page.route(API, handle)
    await page.goto(BASE_URL)
    await open_board(page)
    await expect(page.locator("#leaderboard-list li")).to_have_count(100)
    await expect(page.locator("#player-rank")).to_have_text("Ton score : 101e sur 102 scores.")
    await expect(page.locator("#leaderboard-list .name").first).to_have_text("<img src=x>")
    await expect(page.locator("#leaderboard-list img")).to_have_count(0)
    for viewport in [{"width": 375, "height": 667}, {"width": 667, "height": 320}]:
        await page.set_viewport_size(viewport)
        assert await page.locator("#leaderboard").evaluate("el => el.scrollHeight > el.clientHeight")
        await page.locator("#leaderboard-list li").last.scroll_into_view_if_needed()
        await expect(page.locator("#leaderboard-list li").last).to_be_in_viewport()
        await page.locator("#close-leaderboard").click()
        await expect(page.locator("#leaderboard")).not_to_be_visible()
        await open_board(page)
    await page.locator("#close-leaderboard").click()
    await finish_game(page)
    await page.locator("#over-screen").evaluate("el => el.scrollTop = 0")
    first_line = await page.locator("#over-screen > p").first.bounding_box()
    assert first_line and first_line["y"] >= 0, "Game-over heading must remain reachable in landscape"
    await page.locator("#player-name").fill("Paysage")
    await page.locator("#replay").click()
    assert await page.evaluate("state") == "playing"


async def late_response_after_replay(page):
    release = asyncio.Event()
    sent = asyncio.Event()

    async def handle(route):
        entry = route.request.post_data_json
        sent.set()
        await release.wait()
        await fulfill(route, {"entries": [entry], "total": 1, "rank": 1})

    await page.route(API, handle)
    await page.goto(BASE_URL)
    await finish_game(page)
    await page.locator("#player-name").fill("Première pile")
    await page.locator("#submit-score").click()
    await asyncio.wait_for(sent.wait(), timeout=5)
    await page.locator("#replay").click()
    await finish_game(page, perfects=2)
    second_id = await page.evaluate("pendingScore.id")
    release.set()
    await page.wait_for_function("lastEntryId !== null")
    assert await page.evaluate("pendingScore.id") == second_id
    await expect(page.locator("#over-screen .big-score")).to_have_text("5")
    await expect(page.locator("#score-form")).to_be_visible()
    await expect(page.locator("#submit-score")).to_be_enabled()
    await expect(page.locator("#submit-status")).to_be_empty()


async def zero_and_unavailable_storage(page):
    await page.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } })")
    await page.goto(BASE_URL)
    await finish_game(page, perfects=0)
    await expect(page.locator("#score-form")).to_be_hidden()
    await finish_game(page)
    await expect(page.locator("#score-form")).to_be_visible()
    await expect(page.locator("#over-screen .big-score")).to_have_text("2")


async def out_of_order_submissions(page):
    release_first = asyncio.Event()
    first_sent = asyncio.Event()
    submissions = []

    async def handle(route):
        entry = route.request.post_data_json
        submissions.append(entry)
        if len(submissions) == 1:
            first_sent.set()
            await release_first.wait()
            rank = 2
        else:
            rank = 1
        await fulfill(route, {"entries": list(reversed(submissions)), "total": 2, "rank": rank})

    await page.route(API, handle)
    await page.goto(BASE_URL)
    await finish_game(page)
    await page.locator("#player-name").fill("Ancienne pile")
    await page.locator("#submit-score").click()
    await asyncio.wait_for(first_sent.wait(), timeout=5)
    await page.locator("#replay").click()
    await finish_game(page, perfects=2)
    await page.locator("#player-name").fill("Nouvelle pile")
    await page.locator("#submit-score").click()
    await expect(page.locator("#submit-status")).to_contain_text("1er sur 2 scores")
    latest_id = submissions[1]["id"]
    assert await page.evaluate("lastEntryId") == latest_id
    async with page.expect_response(lambda response: response.request.method == "POST" and response.request.post_data_json["id"] == submissions[0]["id"]) as older_response:
        release_first.set()
    await (await older_response.value).body()
    await page.evaluate("() => new Promise(requestAnimationFrame)")
    assert await page.evaluate("lastEntryId") == latest_id
    assert await page.evaluate("localStorage.getItem('krampouezh-entry')") == latest_id
    await expect(page.locator("#submit-status")).to_contain_text("1er sur 2 scores")
    await expect(page.locator("#score-form")).to_be_hidden()


async def real_api_roundtrip(page):
    before_response = await page.request.get(f"{BASE_URL}/api/leaderboard")
    assert before_response.ok, "The real API must be running (or use --mock-only)"
    before = await before_response.json()
    await page.goto(BASE_URL)
    await finish_game(page)
    name = f"Test {uuid.uuid4().hex[:8]}"
    await page.locator("#player-name").fill(name)
    async with page.expect_response(lambda response: response.url.endswith("/api/leaderboard") and response.request.method == "POST") as response_info:
        await page.locator("#player-name").press("Enter")
    response = await response_info.value
    assert response.ok
    saved = await response.json()
    await expect(page.locator("#submit-status")).to_contain_text("Score enregistré")
    assert saved["total"] == before["total"] + 1
    entry_id = await page.evaluate("localStorage.getItem('krampouezh-entry')")
    duplicate = await page.request.post(f"{BASE_URL}/api/leaderboard", data={"id": entry_id, "name": name, "score": 2})
    assert duplicate.ok and (await duplicate.json())["total"] == saved["total"]
    await page.reload()
    await open_board(page)
    await expect(page.locator("#player-rank")).to_have_text(re.compile(rf"Ton score : .* sur {saved['total']} scores?\."))


async def main():
    tests = [empty_and_errors, save_retry_and_keyboard, outside_top100_and_mobile, late_response_after_replay, out_of_order_submissions, zero_and_unavailable_storage]
    if "--mock-only" not in sys.argv:
        tests.append(real_api_roundtrip)
    async with async_playwright() as playwright:
        launch = {"headless": True}
        if os.environ.get("CHROMIUM_EXECUTABLE"):
            launch["executable_path"] = os.environ["CHROMIUM_EXECUTABLE"]
        browser = await playwright.chromium.launch(**launch)
        try:
            for test in tests:
                context = await browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
                page = await context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                await test(page)
                assert not errors, f"Uncaught browser errors: {errors}"
                await context.close()
                print(f"PASS {test.__name__}", flush=True)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
