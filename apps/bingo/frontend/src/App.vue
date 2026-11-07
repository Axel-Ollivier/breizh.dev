<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ColorPicker from "./components/ColorPicker.vue";
import PlayerList from "./components/PlayerList.vue";
import {
  bonusSummary,
  colorValue,
  combinationLabel,
  preparationValid,
  rankPlayers,
  roundStats,
  usefulError,
} from "./game";
import {
  activation,
  authenticate,
  closedReason,
  command,
  connect,
  connectionError,
  connectionState,
  disconnect,
  openLobby,
  readHostKey,
  snapshot,
  storageWarning,
} from "./session";
import type { Cell, Mode, PublicLobby } from "./types";

const route = useRoute();
const router = useRouter();
const routeCode = computed(() =>
  typeof route.params.code === "string" ? route.params.code.toUpperCase() : "",
);
const lobby = snapshot;
const publicLobby = ref<PublicLobby | null>(null);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const homeMode = ref<"create" | "join">("create");
const joinCode = ref("");
const nickname = ref("");
const selectedColor = ref<number | null>(null);
const recovering = ref(false);
const recoveryKey = ref("");
const words = ref<string[]>([]);
const sips = ref<number[]>([]);
const dirty = ref(false);
const saving = ref(false);
const settingsBudget = ref(20);
const settingsMode = ref<Mode>("random");
const settingsDirty = ref(false);
const tab = ref<"grid" | "players" | "result">("grid");
const selectedCellId = ref<string | null>(null);
const dialog = ref<HTMLDialogElement | null>(null);
const confirmAction = ref<"close" | "end" | "rematch" | null>(null);
const bonusVisible = ref(false);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let oldRound: number | null = null;
let oldSize: number | null = null;
let preparationOwner = "";
const isHost = computed(
  () => lobby.value?.selfId === lobby.value?.hostId && !!lobby.value,
);
const self = computed(() =>
  lobby.value?.players.find((player) => player.id === lobby.value?.selfId),
);
const online = computed(() => connectionState.value === "connected");
const disabled = computed(() => busy.value || !online.value);
const inviteUrl = computed(
  () =>
    `${window.location.origin}${import.meta.env.BASE_URL}${lobby.value?.code ?? routeCode.value}`,
);
const hostKey = computed(() =>
  lobby.value ? (readHostKey(lobby.value.code) ?? "") : "",
);
const filled = computed(
  () =>
    words.value.slice(0, lobby.value?.size ?? 0).filter((word) => word.trim())
      .length,
);
const allocated = computed(() =>
  sips.value
    .slice(0, lobby.value?.size ?? 0)
    .reduce((sum, value) => sum + (Number(value) || 0), 0),
);
const readyLocally = computed(
  () =>
    !!lobby.value &&
    self.value?.color != null &&
    preparationValid(
      words.value,
      sips.value,
      lobby.value.size,
      lobby.value.budget,
      lobby.value.mode,
    ),
);
const selectedCell = computed(() =>
  lobby.value?.cells.find((cell) => cell.id === selectedCellId.value),
);
const selectedOwner = computed(() =>
  lobby.value?.players.find(
    (player) => player.id === selectedCell.value?.ownerId,
  ),
);
const scores = computed(() => rankPlayers(lobby.value?.players ?? []));
const stats = computed(() => (lobby.value ? roundStats(lobby.value) : null));
const visibleActivations = computed(
  () =>
    activation.value?.combinations.filter((combination) =>
      lobby.value?.combinations.some((active) => active.id === combination.id),
    ) ?? [],
);
const completedCellIds = computed(
  () =>
    new Set(
      lobby.value?.combinations.flatMap((combination) => combination.cellIds) ??
        [],
    ),
);
const playersForColor = computed(
  () => lobby.value?.players ?? publicLobby.value?.players ?? [],
);
const waitingText = computed(() => {
  if (!lobby.value) return "";
  if (lobby.value.size < 4)
    return `Encore ${4 - lobby.value.size} joueur${lobby.value.size < 3 ? "s" : ""} pour lancer la partie.`;
  const incomplete = lobby.value.players.filter(
    (player) => !player.ready,
  ).length;
  return incomplete
    ? `${incomplete} préparation${incomplete > 1 ? "s" : ""} à compléter.`
    : "Tout le monde est prêt. À vous de jouer !";
});

async function perform(action: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await action();
  } catch (problem) {
    error.value = usefulError(problem);
  } finally {
    busy.value = false;
  }
}
async function loadRoute() {
  error.value = "";
  notice.value = "";
  closedReason.value = "";
  publicLobby.value = null;
  selectedCellId.value = null;
  recovering.value = false;
  dirty.value = false;
  settingsDirty.value = false;
  preparationOwner = "";
  oldRound = null;
  oldSize = null;
  if (!routeCode.value) {
    await disconnect();
    return;
  }
  if (!/^[A-Z0-9]{6}$/.test(routeCode.value)) {
    error.value = "Ce code doit contenir 6 lettres ou chiffres.";
    return;
  }
  loading.value = true;
  try {
    publicLobby.value = await openLobby(routeCode.value);
    recoveryKey.value = readHostKey(routeCode.value) ?? "";
    if (publicLobby.value?.phase !== "lobby" && publicLobby.value)
      recovering.value = true;
  } catch (problem) {
    error.value = usefulError(problem);
  } finally {
    loading.value = false;
  }
}
watch(routeCode, loadRoute, { immediate: true });
watch(lobby, (next) => {
  if (!next) return;
  const changedRound =
    oldRound !== next.round ||
    preparationOwner !== `${next.code}:${next.selfId}`;
  if (changedRound) {
    words.value = [...next.ownPreparation.words];
    sips.value = [...next.ownPreparation.sips];
    dirty.value = false;
    selectedCellId.value = null;
    tab.value = next.phase === "finished" ? "result" : "grid";
    oldRound = next.round;
    preparationOwner = `${next.code}:${next.selfId}`;
  } else if (!dirty.value && !saving.value) {
    words.value = [...next.ownPreparation.words];
    sips.value = [...next.ownPreparation.sips];
  }
  if (oldSize !== null && oldSize !== next.size && next.phase === "lobby") {
    notice.value = `Vous êtes maintenant ${next.size}. Il faut ${next.size} mots par joueur. Vos saisies sont conservées : vérifiez votre préparation.`;
    // Existing unsaved entries survive participant changes; only missing entries are filled.
  }
  while (words.value.length < next.size) words.value.push("");
  while (sips.value.length < next.size) sips.value.push(0);
  oldSize = next.size;
  if (!settingsDirty.value) {
    settingsBudget.value = next.budget;
    settingsMode.value = next.mode;
  }
});
watch(
  () => lobby.value?.phase,
  (phase, oldPhase) => {
    if (phase !== oldPhase) notice.value = "";
    if (phase === "finished" && oldPhase && oldPhase !== "finished") {
      tab.value = "result";
      selectedCellId.value = null;
    }
    if (phase === "playing" && oldPhase === "finished") tab.value = "grid";
  },
);
watch(activation, (event) => {
  if (!event) {
    bonusVisible.value = false;
    return;
  }
  bonusVisible.value = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    bonusVisible.value = false;
  }, 8500);
});
watch(selectedCellId, async (id) => {
  await nextTick();
  if (id && dialog.value && !dialog.value.open) dialog.value.showModal();
  else if (!id && dialog.value?.open) dialog.value.close();
});
function joinFromHome() {
  const code = joinCode.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    error.value = "Saisissez les 6 lettres ou chiffres du code.";
    return;
  }
  void router.push(`/${code}`);
}
async function createLobby() {
  if (selectedColor.value == null) {
    error.value = "Choisissez votre couleur.";
    return;
  }
  await perform(async () => {
    const session = await authenticate(
      "Create",
      nickname.value.trim(),
      selectedColor.value,
    );
    await router.push(`/${session.code}`);
  });
}
async function joinLobby() {
  if (!recovering.value && selectedColor.value == null) {
    error.value = "Choisissez une couleur libre.";
    return;
  }
  await perform(async () => {
    try {
      if (recovering.value)
        await authenticate(
          "Recover",
          routeCode.value,
          nickname.value.trim(),
          recoveryKey.value.trim() || null,
        );
      else
        await authenticate(
          "Join",
          routeCode.value,
          nickname.value.trim(),
          selectedColor.value,
        );
      publicLobby.value = null;
    } catch (problem) {
      try {
        publicLobby.value = await openLobby(routeCode.value);
      } catch {
        /* Keep original useful error. */
      }
      throw problem;
    }
  });
}
async function savePreparation() {
  if (!lobby.value) return;
  const size = lobby.value.size;
  saving.value = true;
  await perform(async () => {
    await command(
      "SavePreparation",
      words.value.slice(0, size),
      sips.value.slice(0, size).map((value) => Number(value) || 0),
    );
    dirty.value = false;
    notice.value = readyLocally.value
      ? "Préparation enregistrée. Vous êtes prêt !"
      : "Brouillon enregistré. Complétez les champs manquants pour être prêt.";
  });
  saving.value = false;
}
async function chooseColor(color: number) {
  await perform(() => command("SetColor", color));
}
async function saveSettings() {
  await perform(async () => {
    await command(
      "SetSettings",
      Number(settingsBudget.value),
      settingsMode.value,
    );
    settingsDirty.value = false;
    notice.value = "Les paramètres ont été mis à jour pour tout le monde.";
  });
}
async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    notice.value = message;
  } catch {
    notice.value =
      "La copie automatique est indisponible. Appuyez longuement sur le texte pour le copier.";
  }
}
async function shareInvite() {
  if (navigator.share) {
    try {
      await navigator.share({
        title: "On se fait un bingo ?",
        text: `Rejoins notre lobby ${lobby.value?.code}`,
        url: inviteUrl.value,
      });
      return;
    } catch (problem) {
      if (problem instanceof DOMException && problem.name === "AbortError")
        return;
    }
  }
  await copy(inviteUrl.value, "Lien d’invitation copié !");
}
function openCell(cell: Cell) {
  selectedCellId.value = cell.id;
}
function closeCell() {
  selectedCellId.value = null;
}
function backdropClick(event: MouseEvent) {
  if (event.target === dialog.value) closeCell();
}
async function toggleValidation() {
  const cell = selectedCell.value;
  if (!cell) return;
  await perform(() => command("SetValidation", cell.id, !cell.validated));
}
async function confirmCommand() {
  const action = confirmAction.value;
  confirmAction.value = null;
  if (action)
    await perform(() =>
      command(
        action === "close"
          ? "Close"
          : action === "end"
            ? "EndRound"
            : "Rematch",
      ),
    );
}
async function reconnect() {
  if (routeCode.value) await loadRoute();
  else await perform(connect);
}
function expiryLabel() {
  if (!lobby.value?.expiresAt) return "";
  return new Date(lobby.value.expiresAt).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
onBeforeUnmount(() => {
  clearTimeout(toastTimer);
});
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink to="/" class="brand" aria-label="Bingo, accueil"
        ><span class="brand-icon" aria-hidden="true"
          ><i></i><i></i><i></i><i>✓</i></span
        ><span
          >bingo<span class="brand-dot">.</span><small>BREIZH.DEV</small></span
        ></RouterLink
      >
      <span
        v-if="routeCode || lobby"
        class="connection-chip"
        :class="connectionState"
        data-testid="connection-status"
        ><span></span
        >{{
          connectionState === "connected"
            ? "En direct"
            : connectionState === "reconnecting"
              ? "Reconnexion…"
              : connectionState === "connecting"
                ? "Connexion…"
                : "Hors ligne"
        }}</span
      >
      <span v-else class="topbar-note">Le bingo de votre bande</span>
    </header>

    <main>
      <div
        v-if="error || connectionError"
        class="banner error-banner"
        role="alert"
      >
        <span>{{ error || connectionError }}</span
        ><button
          class="icon-button"
          aria-label="Fermer l’erreur"
          @click="
            error = '';
            connectionError = '';
          "
        >
          ×
        </button>
      </div>
      <div v-if="storageWarning" class="banner warning-banner" role="alert">
        {{ storageWarning }}
      </div>
      <div v-if="notice" class="banner notice-banner" role="status">
        <span>{{ notice }}</span
        ><button
          class="icon-button"
          aria-label="Fermer l’information"
          @click="notice = ''"
        >
          ×
        </button>
      </div>
      <div
        v-if="
          (routeCode || lobby) &&
          (connectionState === 'offline' ||
            connectionState === 'reconnecting') &&
          !closedReason
        "
        class="banner warning-banner"
      >
        <span>{{
          connectionState === "reconnecting"
            ? "On essaie de vous reconnecter. Votre place reste réservée."
            : "La connexion est coupée. Votre place reste réservée."
        }}</span
        ><button
          v-if="connectionState === 'offline'"
          class="small-button"
          @click="reconnect"
        >
          Reconnecter
        </button>
      </div>

      <section v-if="closedReason" class="card centered empty-state">
        <span class="large-emoji" aria-hidden="true">☾</span>
        <p class="eyebrow">À une prochaine</p>
        <h1>Le lobby est fermé</h1>
        <p>{{ closedReason }}</p>
        <RouterLink class="button primary" to="/"
          >Retour à l’accueil</RouterLink
        >
      </section>

      <template v-else-if="!routeCode && !lobby">
        <section class="hero">
          <span class="eyebrow"
            ><span class="tiny-star">✦</span> 4 à 10 amis · une seule
            grille</span
          >
          <h1>Vos mots.<br />Vos couleurs.<br /><em>Votre bingo.</em></h1>
          <p>
            Chacun prépare ses mots en secret.<br />La partie les mélange. À
            vous de jouer !
          </p>
          <div class="hero-grid" aria-hidden="true">
            <span>Le retardataire</span><span>« Une dernière »<b>✓</b></span
            ><span>Une anecdote</span><span>Le fou rire<b>✓</b></span
            ><span>BINGO ✦</span><span>La playlist</span><span>Une photo</span
            ><span>La Bretagne</span><span>Le débat</span>
          </div>
        </section>
        <section class="card entry-card">
          <div class="segmented" role="group" aria-label="Créer ou rejoindre">
            <button
              :class="{ active: homeMode === 'create' }"
              @click="
                homeMode = 'create';
                error = '';
              "
            >
              Créer un lobby</button
            ><button
              :class="{ active: homeMode === 'join' }"
              @click="
                homeMode = 'join';
                error = '';
              "
            >
              Rejoindre
            </button>
          </div>
          <form
            v-if="homeMode === 'create'"
            data-testid="create-form"
            @submit.prevent="createLobby"
          >
            <h2>La bande vous attend.</h2>
            <p class="muted">
              Vous serez l’hôte et un joueur comme les autres.
            </p>
            <label class="field"
              >Votre pseudo<input
                v-model="nickname"
                data-testid="nickname"
                name="nickname"
                autocomplete="nickname"
                minlength="2"
                maxlength="24"
                placeholder="Comment vous appelle-t-on ?"
                required
                :disabled="busy"
            /></label>
            <ColorPicker
              v-model="selectedColor"
              :players="[]"
              :disabled="busy"
            />
            <button class="button primary full" type="submit" :disabled="busy">
              {{ busy ? "Création…" : "Créer le lobby" }}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <form v-else data-testid="code-form" @submit.prevent="joinFromHome">
            <h2>Il y a une place pour vous.</h2>
            <p class="muted">
              Entrez le code reçu, ou ouvrez le lien d’invitation.
            </p>
            <label class="field"
              >Code du lobby<input
                v-model="joinCode"
                data-testid="lobby-code"
                class="code-input"
                name="code"
                autocapitalize="characters"
                autocomplete="off"
                maxlength="6"
                minlength="6"
                placeholder="ABC123"
                required
            /></label>
            <button class="button primary full" type="submit">
              Trouver le lobby <span aria-hidden="true">↗</span>
            </button>
          </form>
        </section>
        <div class="how-it-works">
          <p><b>01</b> Choisissez vos mots</p>
          <p><b>02</b> Repérez-les ensemble</p>
          <p><b>03</b> Validez. Bingo !</p>
        </div>
        <p class="footer-note">
          Sans compte. Sans installation. Juste votre téléphone.<br />Les
          gorgées peuvent aussi être des points : à vous de choisir.
        </p>
      </template>

      <section v-else-if="loading && !lobby" class="card centered empty-state">
        <div class="spinner" aria-hidden="true"></div>
        <h1>On retrouve votre bande…</h1>
        <p>Connexion au lobby {{ routeCode }}.</p>
      </section>

      <template v-else-if="!lobby">
        <section class="section-heading">
          <p class="eyebrow">Vous êtes invité</p>
          <h1>La bande se retrouve ici.</h1>
          <span class="code-pill">{{ routeCode }}</span>
        </section>
        <section v-if="publicLobby" class="card entry-card">
          <div class="section-title">
            <h2>
              {{ publicLobby.players.length }} joueur{{
                publicLobby.players.length > 1 ? "s" : ""
              }}
            </h2>
            <span class="status-pill">{{
              publicLobby.phase === "lobby" ? "Préparation" : "Partie commencée"
            }}</span>
          </div>
          <div class="mini-legend">
            <span v-for="player in publicLobby.players" :key="player.id"
              ><i :style="{ background: colorValue(player.color) }"></i
              >{{ player.name }}</span
            >
          </div>
          <p v-if="publicLobby.phase !== 'lobby'" class="banner warning-banner">
            La partie a commencé. Seuls les joueurs déjà inscrits peuvent
            retrouver leur place.
          </p>
          <div
            v-if="publicLobby.phase === 'lobby'"
            class="segmented"
            role="group"
            aria-label="Rejoindre ou retrouver une place"
          >
            <button
              :class="{ active: !recovering }"
              @click="recovering = false"
            >
              Nouvelle place</button
            ><button :class="{ active: recovering }" @click="recovering = true">
              Retrouver ma place
            </button>
          </div>
          <form data-testid="join-form" @submit.prevent="joinLobby">
            <label class="field"
              >Votre pseudo<input
                v-model="nickname"
                data-testid="nickname"
                name="nickname"
                autocomplete="nickname"
                minlength="2"
                maxlength="24"
                required
                :disabled="busy"
            /></label>
            <template v-if="recovering">
              <p class="muted">
                Utilisez votre pseudo exact. Votre place doit être déconnectée.
                Une place encore connectée reste protégée.
              </p>
              <label class="field"
                >Clé de récupération hôte
                <span class="muted">seulement pour l’hôte</span
                ><input
                  v-model="recoveryKey"
                  name="recovery-key"
                  type="password"
                  autocomplete="off"
                  maxlength="128"
                  placeholder="Laissez vide si vous n’êtes pas l’hôte"
                  :disabled="busy"
              /></label>
            </template>
            <ColorPicker
              v-else
              v-model="selectedColor"
              :players="publicLobby.players"
              :disabled="busy"
            />
            <button
              class="button primary full"
              type="submit"
              :disabled="
                busy || (!recovering && publicLobby.players.length >= 10)
              "
            >
              {{
                busy
                  ? "Connexion…"
                  : recovering
                    ? "Retrouver ma place"
                    : "Rejoindre le lobby"
              }}
            </button>
          </form>
        </section>
        <section v-else class="card centered">
          <p>Ce lobby est peut-être fermé ou le code est incorrect.</p>
          <RouterLink class="button secondary" to="/"
            >Retour à l’accueil</RouterLink
          >
        </section>
      </template>

      <template v-else-if="lobby.phase === 'lobby'">
        <section class="section-heading" data-testid="lobby">
          <p class="eyebrow">Manche {{ lobby.round }} · on se prépare</p>
          <h1>
            Tout commence<br />avec votre bande<span class="brand-dot">.</span>
          </h1>
        </section>
        <section class="card invitation-card">
          <div>
            <span class="eyebrow">Code du lobby</span
            ><strong class="invite-code">{{ lobby.code }}</strong>
          </div>
          <button class="button primary" @click="shareInvite">
            Inviter <span aria-hidden="true">↗</span>
          </button>
          <p
            class="invitation-link"
            @click="copy(inviteUrl, 'Lien d’invitation copié !')"
          >
            {{ inviteUrl }}
          </p>
        </section>
        <section class="card">
          <div class="section-title">
            <h2>
              Les joueurs <span class="count">{{ lobby.size }}/10</span>
            </h2>
            <span class="muted">4 minimum</span>
          </div>
          <PlayerList
            :players="lobby.players"
            :self-id="lobby.selfId"
            :size="lobby.size"
            :can-kick="isHost"
            :disabled="disabled"
            @kick="(id) => perform(() => command('Kick', id))"
          />
          <p class="subtle-note">
            Les places sont conservées en cas de déconnexion. L’hôte peut
            retirer une personne déconnectée avant le départ.
          </p>
        </section>
        <section class="card">
          <div class="section-title">
            <h2>Votre préparation</h2>
            <span
              class="status-pill"
              :class="{ success: self?.ready && !dirty }"
              >{{
                dirty ? "À enregistrer" : self?.ready ? "✓ Prêt" : "À compléter"
              }}</span
            >
          </div>
          <p class="muted">
            Vos mots restent secrets jusqu’au lancement, même pour l’hôte.
          </p>
          <ColorPicker
            :model-value="self?.color ?? null"
            :players="playersForColor"
            :self-id="lobby.selfId"
            :disabled="disabled"
            @update:model-value="chooseColor"
          />
          <div class="preparation-caption">
            <strong>{{ lobby.size }} mots pour {{ lobby.size }} joueurs</strong
            ><span>{{ filled }}/{{ lobby.size }}</span>
          </div>
          <p v-if="lobby.mode === 'random'" class="subtle-note">
            Le serveur répartira exactement {{ lobby.budget }} gorgées entre vos
            cases au lancement. Vous n’avez rien à répartir.
          </p>
          <p v-else class="subtle-note">
            Répartissez jusqu’à {{ lobby.budget }} gorgées. Une case peut valoir
            0 et vous pouvez garder une partie du budget inutilisée.
          </p>
          <form @submit.prevent="savePreparation">
            <div class="word-list">
              <div
                v-for="(_, index) in lobby.size"
                :key="index"
                class="word-row"
              >
                <span class="word-number">{{
                  String(index + 1).padStart(2, "0")
                }}</span
                ><label class="sr-only" :for="`word-${index}`"
                  >Mot {{ index + 1 }}</label
                ><input
                  :id="`word-${index}`"
                  v-model="words[index]"
                  :data-testid="`word-${index}`"
                  :name="`word-${index}`"
                  maxlength="60"
                  :placeholder="
                    index === 0
                      ? 'Un mot, une expression…'
                      : `Votre mot ${index + 1}`
                  "
                  :disabled="disabled"
                  @input="dirty = true"
                /><label v-if="lobby.mode === 'manual'" class="sip-field"
                  ><input
                    v-model.number="sips[index]"
                    :data-testid="`sip-${index}`"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    :max="lobby.budget"
                    step="1"
                    :aria-label="`Gorgées du mot ${index + 1}`"
                    :disabled="disabled"
                    @input="dirty = true"
                  /><span>gorgées</span></label
                >
              </div>
            </div>
            <div
              v-if="lobby.mode === 'manual'"
              class="budget-meter"
              :class="{ over: allocated > lobby.budget }"
            >
              <span>{{
                allocated > lobby.budget
                  ? "Budget dépassé"
                  : "Votre répartition"
              }}</span
              ><strong>{{ allocated }} / {{ lobby.budget }}</strong>
            </div>
            <button
              class="button secondary full"
              type="submit"
              data-testid="save-preparation"
              :disabled="
                disabled ||
                saving ||
                (lobby.mode === 'manual' && allocated > lobby.budget)
              "
            >
              {{ saving ? "Enregistrement…" : "Enregistrer mes mots"
              }}<span v-if="readyLocally" aria-hidden="true">✓</span>
            </button>
          </form>
          <p class="subtle-note">
            60 caractères par case. Les mots identiques sont autorisés.
          </p>
        </section>
        <section class="card settings-card">
          <div class="section-title">
            <h2>La règle du jeu</h2>
            <span class="eyebrow">{{
              isHost ? "Réglages hôte" : "Choisis par l’hôte"
            }}</span>
          </div>
          <form v-if="isHost" @submit.prevent="saveSettings">
            <label class="field budget-field"
              >Budget par joueur<span
                ><input
                  v-model.number="settingsBudget"
                  data-testid="budget"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  inputmode="numeric"
                  required
                  :disabled="disabled"
                  @input="settingsDirty = true"
                />
                gorgées</span
              ></label
            >
            <fieldset class="mode-picker" :disabled="disabled">
              <legend>Répartition pour tout le monde</legend>
              <label :class="{ chosen: settingsMode === 'random' }"
                ><input
                  v-model="settingsMode"
                  data-testid="mode-random"
                  type="radio"
                  value="random"
                  @change="settingsDirty = true"
                /><span
                  ><b>Au hasard</b
                  ><small
                    >Tout le budget, réparti librement par le serveur.</small
                  ></span
                ><span aria-hidden="true">⚄</span></label
              ><label :class="{ chosen: settingsMode === 'manual' }"
                ><input
                  v-model="settingsMode"
                  data-testid="mode-manual"
                  type="radio"
                  value="manual"
                  @change="settingsDirty = true"
                /><span
                  ><b>À votre façon</b
                  ><small
                    >Chacun répartit jusqu’au budget, sans obligation de tout
                    utiliser.</small
                  ></span
                ><span aria-hidden="true">✎</span></label
              >
            </fieldset>
            <button
              v-if="settingsDirty"
              type="submit"
              class="button secondary full"
              data-testid="save-settings"
              :disabled="disabled"
            >
              Appliquer les paramètres
            </button>
          </form>
          <p v-else class="settings-summary">
            <strong>{{ lobby.budget }}</strong> gorgées par joueur ·
            {{
              lobby.mode === "random"
                ? "répartition aléatoire"
                : "répartition manuelle"
            }}
          </p>
          <p class="subtle-note">
            La grille est entièrement mélangée. À 0 gorgée, une case compte
            aussi pour les lignes, colonnes et diagonales.
          </p>
        </section>
        <section class="launch-panel">
          <p>{{ waitingText }}</p>
          <button
            v-if="isHost"
            class="button primary full"
            data-testid="start-game"
            :disabled="disabled || !lobby.canStart || dirty || settingsDirty"
            @click="perform(() => command('Start'))"
          >
            Lancer la partie <span aria-hidden="true">↗</span>
          </button>
          <p v-else class="muted">
            L’hôte lancera la partie quand tout le monde sera prêt.
          </p>
          <p v-if="isHost && (dirty || settingsDirty)" class="subtle-note">
            Enregistrez vos derniers changements avant de lancer.
          </p>
        </section>
        <details v-if="isHost" class="card host-details">
          <summary>Votre clé hôte et la fermeture du lobby</summary>
          <p>
            Conservez cette clé en privé : elle permet de retrouver vos droits
            d’hôte si la session de ce navigateur est perdue. Un pseudo seul ne
            suffit pas.
          </p>
          <code class="recovery-code">{{ hostKey }}</code
          ><button
            class="button secondary full"
            @click="copy(hostKey, 'Clé hôte copiée. Conservez-la en privé.')"
          >
            Copier ma clé hôte</button
          ><button
            class="button danger-text full"
            :disabled="disabled"
            @click="confirmAction = 'close'"
          >
            Fermer définitivement le lobby
          </button>
        </details>
      </template>

      <template v-else>
        <section class="game-heading">
          <div>
            <p class="eyebrow">{{ lobby.code }} · manche {{ lobby.round }}</p>
            <h1>
              {{
                lobby.phase === "finished" ? "Quelle partie !" : "Ouvrez l’œil."
              }}
            </h1>
          </div>
          <span class="progress-circle"
            >{{ stats?.validated
            }}<small>/ {{ lobby.cells.length }}</small></span
          >
        </section>
        <div v-if="!lobby.hostConnected" class="banner warning-banner">
          L’hôte est déconnecté. Vous pouvez consulter la partie ; les
          validations reprendront à son retour.
        </div>
        <nav class="segmented game-tabs" aria-label="Vues de la partie">
          <button
            v-if="lobby.phase === 'finished'"
            :class="{ active: tab === 'result' }"
            @click="tab = 'result'"
          >
            Bilan</button
          ><button
            :class="{ active: tab === 'grid' }"
            data-testid="show-grid"
            @click="tab = 'grid'"
          >
            Grille</button
          ><button
            :class="{ active: tab === 'players' }"
            @click="tab = 'players'"
          >
            Joueurs / Classement
          </button>
        </nav>
        <template v-if="tab === 'result' && lobby.phase === 'finished'">
          <section class="card results-card" data-testid="podium">
            <p class="eyebrow">
              {{
                lobby.endReason === "automatic"
                  ? "Toute la grille est validée"
                  : "Manche terminée par l’hôte"
              }}
            </p>
            <h2>
              La bande a fait le plein<br />de bons moments<span
                class="brand-dot"
                >.</span
              >
            </h2>
            <div class="podium">
              <div
                v-for="position in [1, 0, 2]"
                :key="position"
                class="podium-player"
                :class="`place-${position + 1}`"
              >
                <template v-if="scores[position]"
                  ><span class="podium-crown" aria-hidden="true">{{
                    position === 0 ? "✦" : ""
                  }}</span
                  ><span
                    class="avatar"
                    :style="{ background: colorValue(scores[position]?.color) }"
                    >{{ scores[position]?.name.slice(0, 1) }}</span
                  ><strong>{{ scores[position]?.name }}</strong
                  ><small>{{ scores[position]?.score }} gorgées</small
                  ><span class="podium-step">{{ position + 1 }}</span></template
                >
              </div>
            </div>
            <p class="subtle-note">
              Les ex æquo sont départagés par ordre alphabétique pour
              l’affichage.
            </p>
            <div class="stat-grid">
              <div>
                <strong
                  >{{ stats?.validated
                  }}<small>/{{ lobby.cells.length }}</small></strong
                ><span>cases validées</span>
              </div>
              <div>
                <strong>{{ stats?.distributed }}</strong
                ><span>gorgées à distribuer</span>
              </div>
              <div>
                <strong>{{ stats?.combinations }}</strong
                ><span>combinaisons</span>
              </div>
              <div>
                <strong>{{ stats?.collective }}</strong
                ><span>bonus collectifs</span>
              </div>
            </div>
          </section>
          <section class="card">
            <h2>Le classement</h2>
            <PlayerList
              :players="lobby.players"
              :self-id="lobby.selfId"
              :size="lobby.size"
              ranking
            />
            <p class="subtle-note">
              Somme des cases validées de chaque joueur. Les bonus collectifs
              restent séparés.
            </p>
          </section>
          <button
            v-if="isHost"
            class="button primary full"
            data-testid="rematch"
            :disabled="disabled"
            @click="confirmAction = 'rematch'"
          >
            Revanche ! <span aria-hidden="true">↻</span>
          </button>
          <p v-else class="centered muted">
            L’hôte peut proposer une revanche.
          </p>
          <p class="subtle-note centered">
            La grille reste consultable et corrigeable jusqu’à la revanche ou la
            fermeture du lobby.
          </p>
        </template>
        <template v-else-if="tab === 'grid'">
          <p class="grid-instruction">
            Touchez une case pour lire son mot en entier.<span v-if="isHost">
              Vous seul pouvez valider.</span
            >
          </p>
          <div
            class="bingo-grid"
            data-testid="grid"
            :style="{ '--grid-size': lobby.size }"
            :class="{ compact: lobby.size >= 8 }"
            :aria-label="`Grille de bingo ${lobby.size} par ${lobby.size}`"
          >
            <button
              v-for="(cell, index) in lobby.cells"
              :key="cell.id"
              class="bingo-cell"
              data-testid="cell"
              :data-cell-id="cell.id"
              :data-validated="cell.validated"
              :data-owner="cell.ownerId"
              :class="{
                validated: cell.validated,
                'bonus-cell': completedCellIds.has(cell.id),
              }"
              :style="{
                background: colorValue(
                  lobby.players.find((player) => player.id === cell.ownerId)
                    ?.color,
                ),
              }"
              :aria-label="`Ligne ${Math.floor(index / lobby.size) + 1}, colonne ${(index % lobby.size) + 1} : ${cell.word}, ${lobby.players.find((player) => player.id === cell.ownerId)?.name}, ${cell.validated ? 'validée' : 'non validée'}${cell.sips == null ? ', gorgées cachées' : ', ' + cell.sips + ' gorgées'}`"
              @click="openCell(cell)"
            >
              <span class="cell-word">{{ cell.word }}</span
              ><span
                class="cell-value"
                :class="{ hidden: cell.sips == null }"
                >{{ cell.sips == null ? "·" : cell.sips }}</span
              ><span v-if="cell.validated" class="cell-check" aria-hidden="true"
                >✓</span
              >
            </button>
          </div>
          <div class="mini-legend game-legend">
            <span v-for="player in lobby.players" :key="player.id"
              ><i :style="{ background: colorValue(player.color) }"></i
              >{{ player.name
              }}{{ player.id === lobby.selfId ? " (vous)" : "" }}</span
            >
          </div>
          <p class="subtle-note centered">
            Seules vos gorgées et celles des cases validées sont visibles. Les
            distributions se font entre vous, hors de l’application.
          </p>
          <section class="card bonus-card" data-testid="active-combinations">
            <div class="section-title">
              <h2>Bonus collectifs <span aria-hidden="true">✦</span></h2>
              <span class="count">{{ lobby.combinations.length }}</span>
            </div>
            <p v-if="!lobby.combinations.length" class="muted">
              Une ligne, une colonne ou une grande diagonale complète ? Chaque
              joueur absent de cette combinaison reçoit tout le bonus.
            </p>
            <ul v-else class="combination-list">
              <li
                v-for="combination in lobby.combinations"
                :key="combination.id"
              >
                <strong
                  >{{ combinationLabel(combination) }}
                  <span>+{{ combination.bonus }}</span></strong
                >
                <p>{{ bonusSummary(combination, lobby.players) }}</p>
              </li>
            </ul>
            <details class="bonus-rule">
              <summary>Comment le bonus est-il calculé ?</summary>
              <p>
                Somme des gorgées ÷ {{ lobby.size }}, arrondie au plus proche
                (0,5 vers le haut). Pour une grande diagonale, ce résultat
                arrondi est ensuite doublé. Chaque joueur sans aucune case dans
                la combinaison reçoit le bonus entier. Il ne compte pas dans le
                classement.
              </p>
            </details>
          </section>
        </template>
        <section v-else class="card">
          <div class="section-title">
            <h2>À vous de distribuer</h2>
            <span class="eyebrow">Classement en direct</span>
          </div>
          <p class="muted">
            Les gorgées de vos cases validées, à distribuer aux personnes de
            votre choix.
          </p>
          <PlayerList
            :players="lobby.players"
            :self-id="lobby.selfId"
            :size="lobby.size"
            ranking
          />
          <div class="ranking-note">
            <span aria-hidden="true">✦</span>
            <p>
              Les bonus de combinaisons sont affichés séparément sur la grille.
              Ils ne sont jamais ajoutés à ce score.
            </p>
          </div>
        </section>
        <div v-if="isHost" class="host-actions">
          <button
            v-if="lobby.phase === 'playing'"
            class="button secondary full"
            data-testid="end-round"
            :disabled="disabled"
            @click="confirmAction = 'end'"
          >
            Terminer la manche</button
          ><button
            class="button danger-text full"
            :disabled="disabled"
            @click="confirmAction = 'close'"
          >
            Fermer le lobby
          </button>
        </div>
        <p class="footer-note">
          Fermeture automatique à {{ expiryLabel() }} · 6 h après le
          lancement.<br />Si tout le monde part, le lobby est supprimé après 60
          secondes.
        </p>
      </template>
    </main>

    <Transition name="toast"
      ><aside
        v-if="bonusVisible && activation && lobby && visibleActivations.length"
        class="combination-toast"
        data-testid="combination-toast"
        role="status"
        aria-live="polite"
      >
        <span class="toast-star" aria-hidden="true">✦</span>
        <div>
          <strong>{{
            visibleActivations.length > 1 ? "Bingos !" : "Bingo !"
          }}</strong>
          <p v-for="combination in visibleActivations" :key="combination.id">
            <b>{{ combinationLabel(combination) }}</b> ·
            {{ bonusSummary(combination, lobby.players) }}
          </p>
        </div>
        <button
          class="icon-button"
          aria-label="Fermer le bonus"
          @click="bonusVisible = false"
        >
          ×
        </button>
      </aside></Transition
    >

    <dialog
      ref="dialog"
      class="cell-dialog"
      data-testid="cell-detail"
      @click="backdropClick"
      @cancel="closeCell"
      @close="closeCell"
    >
      <article
        v-if="selectedCell"
        class="cell-detail"
        :style="{ '--owner-color': colorValue(selectedOwner?.color) }"
      >
        <button
          class="icon-button modal-close"
          data-testid="dismiss-cell"
          aria-label="Fermer la case"
          @click="closeCell"
        >
          ×</button
        ><span class="eyebrow">{{
          selectedCell.validated ? "✓ Case validée" : "Une case à repérer"
        }}</span>
        <h2>{{ selectedCell.word }}</h2>
        <span class="owner-label"
          ><i :style="{ background: colorValue(selectedOwner?.color) }"></i
          >{{ selectedOwner?.name
          }}{{ selectedOwner?.id === lobby?.selfId ? " · vous" : "" }}</span
        >
        <div class="sip-reveal">
          <strong>{{
            selectedCell.sips == null ? "?" : selectedCell.sips
          }}</strong
          ><span>{{
            selectedCell.sips == null
              ? "Gorgées secrètes jusqu’à la validation"
              : `gorgée${selectedCell.sips > 1 ? "s" : ""} à distribuer`
          }}</span>
        </div>
        <p v-if="selectedCell.sips === 0" class="subtle-note">
          Cette case compte pour les combinaisons, même à 0.
        </p>
        <button
          v-if="isHost"
          class="button primary full"
          data-testid="validate-cell"
          :disabled="disabled || !lobby?.hostConnected"
          @click="toggleValidation"
        >
          {{ selectedCell.validated ? "Annuler la validation" : "Valider"
          }}<span aria-hidden="true">{{
            selectedCell.validated ? "↶" : "✓"
          }}</span>
        </button>
        <p v-else class="subtle-note centered">
          L’hôte valide les cases pour tout le monde.
        </p>
      </article>
    </dialog>

    <div
      v-if="confirmAction"
      class="confirmation-backdrop"
      @click.self="confirmAction = null"
    >
      <section
        class="confirmation-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title">
          {{
            confirmAction === "close"
              ? "Fermer le lobby ?"
              : confirmAction === "end"
                ? "Terminer cette manche ?"
                : "Prêts pour la revanche ?"
          }}
        </h2>
        <p>
          {{
            confirmAction === "close"
              ? "La fermeture est définitive pour tout le monde. Les mots, la grille et les scores seront supprimés."
              : confirmAction === "end"
                ? "Le podium s’affichera pour tout le monde. Les validations resteront corrigeables jusqu’à la revanche."
                : "Vous gardez le même code, les mêmes joueurs et les paramètres. Chacun choisira à nouveau sa couleur et ses mots. La manche actuelle sera effacée."
          }}
        </p>
        <button
          class="button primary full"
          data-testid="confirm-action"
          @click="confirmCommand"
        >
          {{
            confirmAction === "close"
              ? "Fermer définitivement"
              : confirmAction === "end"
                ? "Terminer la manche"
                : "Lancer la revanche"
          }}</button
        ><button class="button secondary full" @click="confirmAction = null">
          Annuler
        </button>
      </section>
    </div>
    <footer class="site-footer">
      <span
        >bingo<span class="brand-dot">.</span>
        <span class="muted">par breizh.dev</span></span
      ><span>Un jeu, à votre rythme.</span>
    </footer>
  </div>
</template>
