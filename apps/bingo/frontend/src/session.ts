import { ref, shallowRef } from "vue";
import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from "@microsoft/signalr";
import type { Activation, PublicLobby, Session, Snapshot } from "./types";
import { usefulError } from "./game";

export const snapshot = shallowRef<Snapshot | null>(null);
export const connectionState = ref<
  "connecting" | "connected" | "reconnecting" | "offline"
>("offline");
export const connectionError = ref("");
export const closedReason = ref("");
export const storageWarning = ref("");
export const activation = shallowRef<Activation | null>(null);
let connection: HubConnection | null = null;
let currentSession: Session | null = null;
let starting: Promise<void> | null = null;
let lastActivationRevision = -1;
let stopping = false;
const sessionPrefix = "breizh.bingo.session.";
const hostPrefix = "breizh.bingo.host.";

function storageRead(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageWrite(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    storageWarning.value =
      "Ce navigateur ne conserve pas votre session. Gardez cet onglet ouvert et copiez votre clé hôte si vous êtes l’hôte.";
  }
}
export function readSession(code: string): Session | null {
  try {
    const stored = JSON.parse(storageRead(sessionPrefix + code) ?? "null");
    return stored?.code === code && typeof stored?.token === "string"
      ? { ...stored, hostKey: readHostKey(code) }
      : null;
  } catch {
    return null;
  }
}
export function readHostKey(code: string) {
  return storageRead(hostPrefix + code);
}
function remember(session: Session) {
  currentSession = session;
  storageWrite(
    sessionPrefix + session.code,
    JSON.stringify({ ...session, hostKey: null }),
  );
  if (session.hostKey) storageWrite(hostPrefix + session.code, session.hostKey);
}
function forget(code: string) {
  try {
    localStorage.removeItem(sessionPrefix + code);
    localStorage.removeItem(hostPrefix + code);
  } catch {
    /* Storage can be disabled. */
  }
}
function acceptState(next: Snapshot) {
  if (
    !snapshot.value ||
    snapshot.value.code !== next.code ||
    next.revision >= snapshot.value.revision
  )
    snapshot.value = next;
}
export async function connect() {
  if (connection?.state === HubConnectionState.Connected) {
    connectionState.value = "connected";
    return;
  }
  if (starting) return starting;
  if (!connection) {
    connection = new HubConnectionBuilder()
      .withUrl(`${import.meta.env.BASE_URL}hub`)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (context) =>
          Math.min(1000 * 2 ** Math.min(context.previousRetryCount, 4), 15000),
      })
      .configureLogging(LogLevel.None)
      .build();
    connection.on("State", acceptState);
    connection.on("CombinationsActivated", (event: Activation) => {
      if (
        connectionState.value === "connected" &&
        currentSession &&
        event.revision > lastActivationRevision
      ) {
        lastActivationRevision = event.revision;
        activation.value = event;
      }
    });
    const close = (reason: string) => {
      closedReason.value = reason;
      if (currentSession) forget(currentSession.code);
      currentSession = null;
      snapshot.value = null;
      activation.value = null;
    };
    connection.on("Closed", close);
    connection.on("Removed", close);
    connection.onreconnecting(() => {
      connectionState.value = "reconnecting";
      activation.value = null;
    });
    connection.onreconnected(async () => {
      try {
        if (currentSession) {
          const resumed = await connection!.invoke<Session>(
            "Resume",
            currentSession.code,
            currentSession.token,
          );
          remember(resumed);
          acceptState(await connection!.invoke<Snapshot>("GetState"));
        }
        connectionError.value = "";
        connectionState.value = "connected";
      } catch (error) {
        connectionError.value = usefulError(error);
        connectionState.value = "offline";
        currentSession = null;
        snapshot.value = null;
      }
    });
    connection.onclose(() => {
      connectionState.value = "offline";
      if (!stopping && !closedReason.value)
        connectionError.value =
          "Vous êtes déconnecté. Touchez « Reconnecter » pour retrouver votre place.";
    });
  }
  connectionState.value = "connecting";
  starting = connection
    .start()
    .then(() => {
      connectionState.value = "connected";
      connectionError.value = "";
    })
    .catch((error) => {
      connectionState.value = "offline";
      throw error;
    })
    .finally(() => {
      starting = null;
    });
  return starting;
}
export async function openLobby(code: string): Promise<PublicLobby | null> {
  closedReason.value = "";
  if (currentSession && currentSession.code !== code) await disconnect();
  await connect();
  const saved =
    currentSession?.code === code ? currentSession : readSession(code);
  if (saved) {
    try {
      const session = await connection!.invoke<Session>(
        "Resume",
        code,
        saved.token,
      );
      remember(session);
      acceptState(await connection!.invoke<Snapshot>("GetState"));
      lastActivationRevision = snapshot.value?.revision ?? -1;
      return null;
    } catch (error) {
      // A vanished lobby/token must not leave the user trapped in an endless reconnect.
      currentSession = null;
      snapshot.value = null;
      connectionError.value = usefulError(error);
    }
  }
  return connection!.invoke<PublicLobby>("Inspect", code);
}
export async function authenticate(
  method: "Create" | "Join" | "Recover",
  ...args: unknown[]
) {
  closedReason.value = "";
  await connect();
  const session = await connection!.invoke<Session>(method, ...args);
  remember(session);
  acceptState(await connection!.invoke<Snapshot>("GetState"));
  lastActivationRevision = snapshot.value?.revision ?? -1;
  connectionError.value = "";
  return session;
}
export async function command(method: string, ...args: unknown[]) {
  if (connectionState.value !== "connected" || !connection || !currentSession)
    throw new Error("connection unavailable");
  await connection.invoke(method, ...args);
}
export async function disconnect() {
  stopping = true;
  if (connection) await connection.stop();
  connection = null;
  starting = null;
  currentSession = null;
  snapshot.value = null;
  activation.value = null;
  lastActivationRevision = -1;
  connectionState.value = "offline";
  connectionError.value = "";
  stopping = false;
}
