import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr'
import { mkdir } from 'node:fs/promises'

interface Session { code: string; playerId: string; token: string; hostKey: string | null }

async function prepare(page: Page, words: string[]) {
  for (let index = 0; index < words.length; index++) {
    await page.getByTestId(`word-${index}`).fill(words[index]!)
    const sip = page.getByTestId(`sip-${index}`)
    if (await sip.count()) await sip.fill(String(index))
  }
  await page.getByTestId('save-preparation').click()
}

async function hub() {
  const client = new HubConnectionBuilder()
    .withUrl('http://127.0.0.1:5080/bingo/hub')
    .configureLogging(LogLevel.None)
    .build()
  await client.start()
  return client
}

test('quatre téléphones : préparation privée, grille partagée, bonus, reconnexion et revanche', async ({ browser }) => {
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const names = ['Alice', 'Benoît', 'Chloé', 'Dorian']
  const preparations = [
    ['Une anecdote', 'La Bretagne', 'Une photo', 'Le fou rire'],
    ['La playlist', 'Un compliment', 'La pluie', 'Un selfie'],
    ['Le dessert', 'Un souvenir', 'Les vacances', 'Un toast'],
    ['Le retardataire', 'La chanson', 'Un jeu de mots', 'Une surprise'],
  ]
  try {
    for (let index = 0; index < 4; index++) {
      const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
      contexts.push(context)
      pages.push(await context.newPage())
    }
    const host = pages[0]!
    await host.goto('/bingo/')
    const create = host.getByTestId('create-form')
    await create.getByTestId('nickname').fill(names[0]!)
    await create.getByTestId('color-0').click()
    await create.getByRole('button', { name: 'Créer le lobby', exact: true }).click()
    await expect(host.getByTestId('lobby')).toBeVisible()
    await expect(host).toHaveURL(/\/bingo\/[A-Z0-9]{6}$/)
    const code = new URL(host.url()).pathname.split('/').filter(Boolean).at(-1)!
    expect(code).toMatch(/^[A-Z0-9]{6}$/)

    for (let index = 1; index < 4; index++) {
      const page = pages[index]!
      await page.goto(`/bingo/${code}`)
      const join = page.getByTestId('join-form')
      await expect(join.getByTestId('color-0')).toBeDisabled()
      await join.getByTestId('nickname').fill(names[index]!)
      await join.getByTestId(`color-${index}`).click()
      await join.getByRole('button', { name: 'Rejoindre le lobby', exact: true }).click()
      await expect(page.getByTestId('lobby')).toBeVisible()
    }
    await expect(host.getByTestId('start-game')).toBeDisabled()
    for (const page of pages) await expect(page.getByTestId('sip-0')).toHaveCount(0)
    // The host selects the global manual mode for all players.
    await host.getByTestId('mode-manual').check()
    await host.getByTestId('save-settings').click()
    for (const page of pages) await expect(page.getByTestId('sip-0')).toBeVisible()
    for (let index = 0; index < 4; index++) await prepare(pages[index]!, preparations[index]!)
    await expect(pages[1]!.getByText('Une anecdote', { exact: true })).toHaveCount(0)
    await mkdir('/tmp/bingo-screenshots', { recursive: true })
    await pages[1]!.screenshot({ path: '/tmp/bingo-screenshots/lobby-mobile.png', fullPage: true })
    await expect(host.getByTestId('start-game')).toBeEnabled()
    await host.getByTestId('start-game').click()
    for (const page of pages) await expect(page.getByTestId('cell')).toHaveCount(16)
    await host.screenshot({ path: '/tmp/bingo-screenshots/game-mobile-4x4.png', fullPage: true })

    // Hidden values are absent from the guest's detail until the host validates.
    const foreignCell = pages[1]!.getByTestId('cell').filter({ hasText: 'Une anecdote' })
    await foreignCell.click()
    await expect(pages[1]!.getByTestId('cell-detail')).toContainText('Gorgées secrètes')
    await expect(pages[1]!.getByTestId('validate-cell')).toHaveCount(0)
    await pages[1]!.getByTestId('dismiss-cell').click()

    // Complete the first row: every phone receives the new combination animation.
    const firstRowWords = await host.getByTestId('cell').locator('.cell-word').allTextContents()
    const expectedScores = new Map(names.map(name => [name, 0]))
    for (const word of firstRowWords.slice(0, 4)) {
      const ownerIndex = preparations.findIndex(words => words.includes(word))
      const name = names[ownerIndex]!
      const sips = preparations[ownerIndex]!.indexOf(word)
      expectedScores.set(name, expectedScores.get(name)! + sips)
    }
    for (let index = 0; index < 4; index++) {
      await host.getByTestId('cell').nth(index).click()
      await host.getByTestId('validate-cell').click()
      await host.getByTestId('dismiss-cell').click()
    }
    for (const page of pages) {
      await expect(page.getByTestId('combination-toast')).toBeVisible()
      await expect(page.getByTestId('active-combinations')).toContainText('Ligne 1')
    }
    for (const page of pages) {
      await page.getByRole('button', { name: 'Joueurs / Classement', exact: true }).click()
      for (const [name, score] of expectedScores) {
        await expect(page.getByTestId('ranking').locator('li').filter({ hasText: name }).locator('.score')).toHaveText(`${score} gorgées`)
      }
      await page.getByTestId('show-grid').click()
    }

    // A direct refresh preserves identity, the state and persistent bonus without replay.
    await pages[2]!.reload()
    await expect(pages[2]!.getByTestId('cell')).toHaveCount(16)
    await expect(pages[2]!.getByTestId('active-combinations')).toContainText('Ligne 1')
    await expect(pages[2]!.getByTestId('combination-toast')).toHaveCount(0)

    // Undoing a validation removes the current bonus on all phones.
    await host.getByTestId('cell').first().click()
    await host.getByTestId('validate-cell').click()
    await host.getByTestId('dismiss-cell').click()
    for (const page of pages) await expect(page.getByTestId('active-combinations')).not.toContainText('Ligne 1')

    // Validating the remaining cells ends the round automatically. A correction reopens it.
    for (let index = 0; index < 16; index++) {
      if ([1, 2, 3].includes(index)) continue
      await host.getByTestId('cell').nth(index).click()
      await host.getByTestId('validate-cell').click()
      if (index < 15) await host.getByTestId('dismiss-cell').click()
    }
    for (const page of pages) await expect(page.getByTestId('podium')).toBeVisible()
    for (const page of pages) {
      for (const name of names) await expect(page.getByTestId('ranking').locator('li').filter({ hasText: name }).locator('.score')).toHaveText('6 gorgées')
    }
    await host.getByTestId('show-grid').click()
    await host.getByTestId('cell').first().click()
    await host.getByTestId('validate-cell').click()
    await host.getByTestId('dismiss-cell').click()
    await expect(host.getByTestId('podium')).toHaveCount(0)
    await expect(host.getByTestId('end-round')).toBeVisible()

    await host.getByTestId('end-round').click()
    await host.getByTestId('confirm-action').click()
    for (const page of pages) await expect(page.getByTestId('podium')).toBeVisible()
    await host.getByTestId('show-grid').click()
    await host.getByTestId('cell').first().click()
    await expect(host.getByTestId('validate-cell')).toBeEnabled()
    await host.getByTestId('validate-cell').click()
    await host.getByTestId('dismiss-cell').click()
    // Returning to the result screen also keeps correction available before reset.
    await host.getByRole('button', { name: 'Bilan', exact: true }).click()
    await host.getByTestId('rematch').click()
    await host.getByTestId('confirm-action').click()
    for (const page of pages) {
      await expect(page.getByTestId('lobby')).toBeVisible()
      await expect(page.getByTestId('word-0')).toHaveValue('')
      await expect(page.getByTestId('color-0')).toBeEnabled()
      await expect(page.getByTestId('cell')).toHaveCount(0)
      expect(page.url()).toContain(`/bingo/${code}`)
    }
    await expect(host.getByTestId('start-game')).toBeDisabled()
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('grille 10 × 10 lisible et sans débordement sur un téléphone étroit', async ({ page }, testInfo) => {
  const clients: HubConnection[] = []
  try {
    const host = await hub()
    clients.push(host)
    const session = await host.invoke<Session>('Create', 'Hôte dix', 0)
    for (let index = 1; index < 10; index++) {
      const player = await hub()
      clients.push(player)
      await player.invoke('Join', session.code, `Ami ${index}`, index)
    }
    await host.invoke('SetSettings', 10, 'random')
    for (let index = 0; index < 10; index++) {
      await clients[index]!.invoke('SavePreparation', Array.from({ length: 10 }, (_, word) => `Une expression très longue à lire en entier ${index * 10 + word}`), Array(10).fill(0))
    }
    await host.invoke('Start')
    await page.setViewportSize({ width: 320, height: 720 })
    await page.addInitScript((saved: Session) => {
      localStorage.setItem(`breizh.bingo.session.${saved.code}`, JSON.stringify({ ...saved, hostKey: null }))
      if (saved.hostKey) localStorage.setItem(`breizh.bingo.host.${saved.code}`, saved.hostKey)
    }, session)
    await page.goto(`/bingo/${session.code}`)
    await expect(page.getByTestId('cell')).toHaveCount(100)
    const bounds = await page.getByTestId('grid').boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    await page.screenshot({ path: testInfo.outputPath('bingo-mobile-10x10.png'), fullPage: true })
    await mkdir('/tmp/bingo-screenshots', { recursive: true })
    await page.screenshot({ path: '/tmp/bingo-screenshots/game-mobile-10x10.png', fullPage: true })
    await page.getByTestId('cell').first().click()
    await expect(page.getByTestId('cell-detail')).toContainText('Une expression très longue à lire en entier')
    const detail = await page.getByTestId('cell-detail').boundingBox()
    expect(detail!.width).toBeGreaterThan(bounds!.width / 2)
    await page.getByTestId('dismiss-cell').click()
    await expect(page.getByTestId('cell-detail')).not.toBeVisible()
  } finally {
    await Promise.all(clients.map(client => client.stop()))
  }
})

test('récupérer une session perdue sans usurper une place connectée ni les droits hôte', async ({ page, browser }) => {
  const clients: HubConnection[] = []
  const recoveryContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  try {
    const host = await hub()
    const member = await hub()
    const observer = await hub()
    clients.push(host, member, observer)
    const hostSession = await host.invoke<Session>('Create', 'Hôte retrouvé', 0)
    const memberSession = await member.invoke<Session>('Join', hostSession.code, 'Camille', 1)
    await member.invoke('SavePreparation', ['Mon mot conservé', 'Mon autre mot'], [0, 0])
    const url = `/bingo/${hostSession.code}`

    // Resume the ordinary player on a phone, then lose its local session on that same phone.
    await page.goto('/bingo/')
    await page.evaluate((session: Session) => localStorage.setItem(`breizh.bingo.session.${session.code}`, JSON.stringify(session)), memberSession)
    await member.stop()
    await page.goto(url)
    await expect(page.getByTestId('lobby')).toBeVisible()
    await expect(page.getByTestId('word-0')).toHaveValue('Mon mot conservé')
    await page.evaluate((code: string) => localStorage.removeItem(`breizh.bingo.session.${code}`), hostSession.code)
    await page.goto('about:blank')
    await expect.poll(async () => {
      const state = await observer.invoke<{ players: { id: string; connected: boolean }[] }>('Inspect', hostSession.code)
      return state.players.find(player => player.id === memberSession.playerId)?.connected
    }).toBe(false)
    await page.goto(url)
    await page.getByRole('group', { name: 'Rejoindre ou retrouver une place' }).getByRole('button', { name: 'Retrouver ma place' }).click()
    await page.getByTestId('join-form').getByTestId('nickname').fill('Camille')
    await page.getByTestId('join-form').getByRole('button', { name: 'Retrouver ma place' }).click()
    await expect(page.getByTestId('lobby')).toBeVisible()
    await expect(page.getByTestId('word-0')).toHaveValue('Mon mot conservé')
    await expect(page.getByTestId('connection-status')).toHaveText('En direct')
    await expect(page.getByTestId('save-preparation')).toBeEnabled()
    const recovered = await page.evaluate((code: string) => JSON.parse(localStorage.getItem(`breizh.bingo.session.${code}`)!), hostSession.code) as Session
    expect(recovered.playerId).toBe(memberSession.playerId)
    expect(recovered.token !== memberSession.token).toBe(true)
    await page.getByTestId('word-0').fill('Toujours ma place')
    await page.getByTestId('save-preparation').click()
    await expect(page.getByRole('status')).toContainText('Préparation enregistrée')

    // Another phone cannot take Camille's now-connected identity by knowing the nickname.
    const recoveryPage = await recoveryContext.newPage()
    await recoveryPage.goto(url)
    await recoveryPage.getByRole('group', { name: 'Rejoindre ou retrouver une place' }).getByRole('button', { name: 'Retrouver ma place' }).click()
    await recoveryPage.getByTestId('join-form').getByTestId('nickname').fill('Camille')
    await recoveryPage.getByTestId('join-form').getByRole('button', { name: 'Retrouver ma place' }).click()
    await expect(recoveryPage.getByRole('alert')).toContainText('encore connectée')
    await expect(recoveryPage.getByTestId('lobby')).toHaveCount(0)

    // An obsolete stored token must fall back to recovery on the live connection.
    await host.stop()
    await expect.poll(async () => {
      const state = await observer.invoke<{ players: { id: string; connected: boolean }[] }>('Inspect', hostSession.code)
      return state.players.find(player => player.id === hostSession.playerId)?.connected
    }).toBe(false)
    await recoveryPage.evaluate((session: Session) => localStorage.setItem(`breizh.bingo.session.${session.code}`, JSON.stringify({ ...session, token: 'session-perdue', hostKey: null })), hostSession)
    await recoveryPage.reload()
    await expect(recoveryPage.getByTestId('join-form')).toBeVisible()
    await recoveryPage.getByRole('group', { name: 'Rejoindre ou retrouver une place' }).getByRole('button', { name: 'Retrouver ma place' }).click()
    await recoveryPage.getByTestId('join-form').getByTestId('nickname').fill('Hôte retrouvé')
    await recoveryPage.getByTestId('join-form').getByRole('button', { name: 'Retrouver ma place' }).click()
    await expect(recoveryPage.getByRole('alert')).toContainText('récupération de l’hôte est nécessaire')
    await expect(recoveryPage.getByTestId('budget')).toHaveCount(0)
    await recoveryPage.locator('input[name="recovery-key"]').fill(hostSession.hostKey!)
    await recoveryPage.getByTestId('join-form').getByRole('button', { name: 'Retrouver ma place' }).click()
    await expect(recoveryPage.getByTestId('lobby')).toBeVisible()
    await expect(recoveryPage.getByTestId('connection-status')).toHaveText('En direct')
    await expect(recoveryPage.getByTestId('budget')).toBeEnabled()
    await recoveryPage.getByTestId('budget').fill('12')
    await recoveryPage.getByTestId('save-settings').click()
    await expect.poll(async () => (await observer.invoke<{ budget: number }>('Inspect', hostSession.code)).budget).toBe(12)
    await expect(page.getByTestId('lobby')).toBeVisible()
    await expect(page.getByTestId('word-0')).toHaveValue('Toujours ma place')
  } finally {
    await recoveryContext.close()
    await Promise.all(clients.map(client => client.stop()))
  }
})
