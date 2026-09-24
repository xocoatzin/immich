<script lang="ts">
  import Markdown from '$lib/components/posts/Markdown.svelte';
  import PostAttachmentPicker from '$lib/components/posts/PostAttachmentPicker.svelte';
  import PostAudiencePicker from '$lib/components/posts/PostAudiencePicker.svelte';
  import PostMarkdownToolbar, { type MarkdownAction } from '$lib/components/posts/PostMarkdownToolbar.svelte';
  import { getPostAttachmentDetails } from '$lib/services/post.service';
  import { insertLink, prefixLines, wrapSelection, type TextEdit } from '$lib/utils/post-markdown';
  import {
    PostVisibility,
    createPost,
    updatePost,
    validatePost,
    type AlbumResponseDto,
    type AssetResponseDto,
    type PostAttachmentDto,
    type PostResponseDto,
    type UserResponseDto,
  } from '@immich/sdk';
  import { FormModal, Icon, Select, type SelectOption } from '@immich/ui';
  import { mdiAlertOutline, mdiPencilOutline } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { handleError } from '$lib/utils/handle-error';

  interface Props {
    /** When set, the composer edits this post instead of creating a new one. */
    post?: PostResponseDto;
    onClose: (saved?: PostResponseDto) => void;
  }

  let { post, onClose }: Props = $props();

  const isEdit = $derived(post !== undefined);

  let body = $state(post?.body ?? '');
  let visibility = $state<PostVisibility>(post?.visibility ?? PostVisibility.Private);
  let previewing = $state(false);
  let warnings = $state<string[]>([]);
  let submitting = $state(false);
  let textarea: HTMLTextAreaElement | undefined = $state();

  const selectedAssets = new SvelteMap<string, AssetResponseDto>();
  const selectedAlbums = new SvelteMap<string, AlbumResponseDto>();
  const audience = new SvelteMap<string, UserResponseDto>();
  /**
   * Edit-mode audience IDs that have not (yet) resolved to a user object.
   * Kept separate from resolved users so the composer never fabricates user
   * DTOs; the audience picker backfills them on mount and the server
   * hard-validates the IDs on submit.
   */
  const pendingAudienceIds = new SvelteSet<string>();
  /**
   * Edit-mode attachments whose details failed to load (e.g. transient fetch
   * failure). Kept so saving doesn't silently drop them; the server still
   * hard-validates access on submit.
   */
  const unresolvedAttachments = new SvelteMap<string, PostAttachmentDto>();

  const visibilityOptions = $derived<SelectOption<PostVisibility>[]>([
    { value: PostVisibility.Private, label: $t('visibility_private') },
    { value: PostVisibility.Partners, label: $t('visibility_partners') },
    { value: PostVisibility.Specific, label: $t('visibility_specific') },
    { value: PostVisibility.Public, label: $t('visibility_public') },
  ]);

  const attachments = $derived<PostAttachmentDto[]>([
    ...[...selectedAssets.keys()].map((assetId) => ({ assetId })),
    ...[...selectedAlbums.keys()].map((albumId) => ({ albumId })),
    // preserve edit-mode attachments that failed to load, unless re-resolved above
    ...[...unresolvedAttachments.values()].filter(
      (attachment) => !selectedAssets.has(attachment.assetId!) && !selectedAlbums.has(attachment.albumId!),
    ),
  ]);

  // --- markdown toolbar ---

  const applyEdit = (edit: (value: string, start: number, end: number) => TextEdit) => {
    const element = textarea;
    if (!element) {
      return;
    }
    const start = element.selectionStart ?? body.length;
    const end = element.selectionEnd ?? body.length;
    const result = edit(body, start, end);
    body = result.value;
    previewing = false;
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(result.start, result.end);
    });
  };

  const placeholder = $derived($t('post_composer_placeholder_text'));

  const handleToolbarAction = (action: MarkdownAction) => {
    switch (action) {
      case 'bold': {
        applyEdit((value, start, end) => wrapSelection(value, start, end, '**', '**', placeholder));
        break;
      }
      case 'italic': {
        applyEdit((value, start, end) => wrapSelection(value, start, end, '*', '*', placeholder));
        break;
      }
      case 'strikethrough': {
        applyEdit((value, start, end) => wrapSelection(value, start, end, '~~', '~~', placeholder));
        break;
      }
      case 'code': {
        applyEdit((value, start, end) => wrapSelection(value, start, end, '`', '`', placeholder));
        break;
      }
      case 'link': {
        applyEdit((value, start, end) => insertLink(value, start, end, placeholder));
        break;
      }
      case 'heading': {
        applyEdit((value, start, end) => prefixLines(value, start, end, '## '));
        break;
      }
      case 'quote': {
        applyEdit((value, start, end) => prefixLines(value, start, end, '> '));
        break;
      }
      case 'list': {
        applyEdit((value, start, end) => prefixLines(value, start, end, '- '));
        break;
      }
    }
  };

  // --- attachment/audience mismatch warnings (warn, don't block) ---

  let validateTimer: ReturnType<typeof setTimeout> | undefined;
  let validateSeq = 0;
  /** All audience IDs, resolved or still pending resolution. */
  const audienceIds = $derived<string[]>([...audience.keys(), ...pendingAudienceIds]);
  const scheduleValidation = () => {
    clearTimeout(validateTimer);
    // increment synchronously so a request scheduled before attachments were
    // removed can never overwrite the cleared warnings when it resolves late
    const seq = ++validateSeq;
    validateTimer = setTimeout(async () => {
      if (attachments.length === 0) {
        warnings = [];
        return;
      }
      try {
        const result = await validatePost({
          postValidateDto: {
            // schema requires a non-empty body; warnings don't depend on its content
            body: body || 'x',
            visibility,
            audience: visibility === PostVisibility.Specific ? audienceIds : undefined,
            attachments,
          },
        });
        // ignore stale responses from earlier keystrokes
        if (seq === validateSeq) {
          warnings = result.warnings;
        }
      } catch {
        if (seq === validateSeq) {
          warnings = [];
        }
      }
    }, 500);
  };

  $effect(() => {
    // track reactive deps for validation (identity, not just counts)
    void body;
    void visibility;
    void [...selectedAssets.keys()].join(',');
    void [...selectedAlbums.keys()].join(',');
    void [...unresolvedAttachments.keys()].join(',');
    void audienceIds.join(',');
    scheduleValidation();
    return () => clearTimeout(validateTimer);
  });

  // --- submit ---

  const needsAudience = $derived(visibility === PostVisibility.Specific && audienceIds.length === 0);
  const canSubmit = $derived(!submitting && body.trim().length > 0 && !needsAudience);

  const onSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    submitting = true;
    try {
      const dto = {
        body: body.trim(),
        visibility,
        audience: visibility === PostVisibility.Specific ? audienceIds : [],
        attachments,
      };
      const saved = isEdit
        ? await updatePost({ id: post!.id, postUpdateDto: dto })
        : await createPost({ postCreateDto: dto });
      onClose(saved);
    } catch (error) {
      handleError(error, $t(isEdit ? 'errors.error_updating_post' : 'errors.error_creating_post'));
    } finally {
      submitting = false;
    }
  };

  onMount(async () => {
    if (!post) {
      return;
    }
    // pre-fill attachments and audience for edit mode
    for (const [index, attachment] of post.attachments.entries()) {
      const key = attachment.assetId ?? attachment.albumId ?? `unresolved-${index}`;
      const dto: PostAttachmentDto = {
        assetId: attachment.assetId ?? undefined,
        albumId: attachment.albumId ?? undefined,
      };
      try {
        const { asset, album } = await getPostAttachmentDetails(post.id, attachment);
        if (asset) {
          selectedAssets.set(asset.id, asset);
        } else if (album) {
          selectedAlbums.set(album.id, album);
        } else {
          unresolvedAttachments.set(key, dto);
        }
      } catch {
        unresolvedAttachments.set(key, dto);
      }
    }
    for (const id of post.audience ?? []) {
      pendingAudienceIds.add(id);
    }
  });
</script>

<FormModal
  icon={mdiPencilOutline}
  title={isEdit ? $t('edit_post') : $t('new_post')}
  size="large"
  submitText={isEdit ? $t('save') : $t('post')}
  disabled={!canSubmit}
  {onClose}
  {onSubmit}
>
  <div class="flex flex-col gap-4 p-6">
    <div class="flex items-center justify-between gap-2">
      <PostMarkdownToolbar onAction={handleToolbarAction} disabled={previewing} />
      <div
        class="flex gap-1 rounded-xl bg-immich-fg/5 p-1 text-sm dark:bg-immich-dark-fg/5"
        role="tablist"
        aria-label={$t('post_composer_mode')}
      >
        <button
          type="button"
          role="tab"
          aria-selected={!previewing}
          class="rounded-lg px-3 py-1 {!previewing
            ? 'bg-immich-bg font-medium shadow dark:bg-immich-dark-bg'
            : 'opacity-60'}"
          onclick={() => (previewing = false)}
        >
          {$t('write')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={previewing}
          class="rounded-lg px-3 py-1 {previewing
            ? 'bg-immich-bg font-medium shadow dark:bg-immich-dark-bg'
            : 'opacity-60'}"
          onclick={() => (previewing = true)}
        >
          {$t('preview')}
        </button>
      </div>
    </div>

    {#if previewing}
      <div class="min-h-40 rounded-xl border border-immich-fg/15 p-3 dark:border-immich-dark-fg/15" role="tabpanel">
        {#if body.trim()}
          <Markdown source={body} />
        {:else}
          <p class="opacity-50">{$t('post_composer_preview_empty')}</p>
        {/if}
      </div>
    {:else}
      <textarea
        bind:this={textarea}
        bind:value={body}
        rows="6"
        class="min-h-40 w-full resize-y rounded-xl border border-immich-fg/15 bg-transparent p-3 focus:border-immich-primary focus:outline-none dark:border-immich-dark-fg/15"
        placeholder={$t('post_composer_placeholder')}
        aria-label={$t('post_body')}></textarea>
    {/if}

    <div class="flex flex-col gap-2">
      <span class="text-sm font-medium">{$t('visibility')}</span>
      <Select options={visibilityOptions} bind:value={visibility} />
    </div>

    {#if visibility === PostVisibility.Specific}
      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium">{$t('post_audience')}</span>
        <PostAudiencePicker selected={audience} pendingIds={pendingAudienceIds} />
        {#if needsAudience}
          <p class="text-xs text-yellow-700 dark:text-yellow-400">{$t('post_audience_required')}</p>
        {/if}
      </div>
    {/if}

    <details>
      <summary class="cursor-pointer text-sm font-medium">
        {$t('post_attachments')} ({selectedAssets.size + selectedAlbums.size + unresolvedAttachments.size})
      </summary>
      <div class="pt-2">
        <PostAttachmentPicker {selectedAssets} {selectedAlbums} />
      </div>
    </details>

    {#if warnings.length > 0}
      <div class="flex flex-col gap-1 rounded-xl border border-yellow-600/30 bg-yellow-500/10 p-3 text-sm" role="alert">
        {#each warnings as warning (warning)}
          <p class="flex items-start gap-2">
            <Icon icon={mdiAlertOutline} size="16" class="mt-0.5 shrink-0 text-yellow-700 dark:text-yellow-400" />
            <span>{warning}</span>
          </p>
        {/each}
      </div>
    {/if}
  </div>
</FormModal>
