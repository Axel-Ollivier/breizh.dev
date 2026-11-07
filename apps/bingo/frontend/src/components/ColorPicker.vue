<script setup lang="ts">
import { palette } from "../game";
import type { Player } from "../types";
defineProps<{
  modelValue: number | null;
  players: Player[];
  selfId?: string;
  disabled?: boolean;
}>();
defineEmits<{ "update:modelValue": [value: number] }>();
</script>

<template>
  <fieldset class="color-picker" :disabled="disabled">
    <legend>Votre couleur <span class="muted">· une par personne</span></legend>
    <div class="swatches">
      <button
        v-for="(color, index) in palette"
        :key="color.name"
        type="button"
        :data-testid="`color-${index}`"
        :style="{ '--swatch': color.value }"
        :class="{
          selected: modelValue === index,
          taken: players.some(
            (player) => player.color === index && player.id !== selfId,
          ),
        }"
        :disabled="
          disabled ||
          players.some(
            (player) => player.color === index && player.id !== selfId,
          )
        "
        :aria-pressed="modelValue === index"
        :aria-label="`${color.name}${players.some((player) => player.color === index && player.id !== selfId) ? ' · prise par ' + players.find((player) => player.color === index)?.name : ''}`"
        @click="$emit('update:modelValue', index)"
      >
        <span aria-hidden="true">{{
          modelValue === index
            ? "✓"
            : players.some(
                  (player) => player.color === index && player.id !== selfId,
                )
              ? "×"
              : ""
        }}</span>
      </button>
    </div>
    <small
      >{{
        modelValue == null
          ? "Choisissez une couleur libre."
          : palette[modelValue]?.name
      }}
      Les couleurs marquées × sont déjà prises.</small
    >
  </fieldset>
</template>
