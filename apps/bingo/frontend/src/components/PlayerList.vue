<script setup lang="ts">
import { colorValue, rankPlayers } from "../game";
import type { Player } from "../types";
import { computed } from "vue";
const props = defineProps<{
  players: Player[];
  selfId?: string;
  size: number;
  ranking?: boolean;
  canKick?: boolean;
  disabled?: boolean;
}>();
defineEmits<{ kick: [id: string] }>();
const displayed = computed(() =>
  props.ranking ? rankPlayers(props.players) : props.players,
);
</script>

<template>
  <ol class="player-list" :data-testid="ranking ? 'ranking' : 'players'">
    <li v-for="(player, index) in displayed" :key="player.id">
      <span v-if="ranking" class="rank-number">{{ index + 1 }}</span>
      <span class="avatar" :style="{ background: colorValue(player.color) }"
        >{{ player.name.slice(0, 1).toLocaleUpperCase("fr")
        }}<span class="presence" :class="{ connected: player.connected }"></span
      ></span>
      <span class="player-name"
        ><strong
          >{{ player.name
          }}<span v-if="player.id === selfId" class="muted">
            · vous</span
          ></strong
        ><small
          >{{ player.isHost ? "Hôte · " : ""
          }}{{ player.connected ? "Connecté" : "Déconnecté" }}</small
        ></span
      >
      <strong v-if="ranking" class="score"
        >{{ player.score }} <small>gorgées</small></strong
      >
      <span v-else class="readiness" :class="{ ready: player.ready }">{{
        player.ready ? "✓ Prêt" : `${player.wordCount}/${size} mots`
      }}</span>
      <button
        v-if="canKick && !player.connected && !player.isHost"
        class="icon-button kick"
        :disabled="disabled"
        :aria-label="`Expulser ${player.name}`"
        @click="$emit('kick', player.id)"
      >
        ×
      </button>
    </li>
  </ol>
</template>
