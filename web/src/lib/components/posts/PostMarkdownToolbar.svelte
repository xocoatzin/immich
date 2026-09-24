<script lang="ts">
  import { IconButton } from '@immich/ui';
  import {
    mdiCodeTags,
    mdiFormatBold,
    mdiFormatHeader1,
    mdiFormatItalic,
    mdiFormatListBulleted,
    mdiFormatQuoteClose,
    mdiFormatStrikethrough,
    mdiLink,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';

  export type MarkdownAction = 'bold' | 'italic' | 'strikethrough' | 'code' | 'link' | 'heading' | 'quote' | 'list';

  interface Props {
    onAction: (action: MarkdownAction) => void;
    disabled?: boolean;
  }

  let { onAction, disabled = false }: Props = $props();

  const buttons: { action: MarkdownAction; icon: string; label: string }[] = $derived([
    { action: 'bold', icon: mdiFormatBold, label: $t('format_bold') },
    { action: 'italic', icon: mdiFormatItalic, label: $t('format_italic') },
    { action: 'strikethrough', icon: mdiFormatStrikethrough, label: $t('format_strikethrough') },
    { action: 'code', icon: mdiCodeTags, label: $t('format_code') },
    { action: 'link', icon: mdiLink, label: $t('format_link') },
    { action: 'heading', icon: mdiFormatHeader1, label: $t('format_heading') },
    { action: 'quote', icon: mdiFormatQuoteClose, label: $t('format_quote') },
    { action: 'list', icon: mdiFormatListBulleted, label: $t('format_list') },
  ]);
</script>

<div class="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label={$t('formatting')}>
  {#each buttons as { action, icon, label } (action)}
    <IconButton {icon} title={label} aria-label={label} {disabled} onclick={() => onAction(action)} />
  {/each}
</div>
