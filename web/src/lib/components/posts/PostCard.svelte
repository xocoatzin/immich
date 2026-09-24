<script lang="ts">
  import { clickOutside } from '$lib/actions/click-outside';
  import Markdown from '$lib/components/posts/Markdown.svelte';
  import PostLikeButton from '$lib/components/posts/PostLikeButton.svelte';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { Route } from '$lib/route';
  import { deletePostAndNotify, getPostAttachmentDetails, openPostComposer } from '$lib/services/post.service';
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize, PostVisibility, type PostResponseDto } from '@immich/sdk';
  import { Icon, IconButton } from '@immich/ui';
  import {
    mdiAccountMultipleOutline,
    mdiCommentOutline,
    mdiDotsVertical,
    mdiEarth,
    mdiImageAlbum,
    mdiLockOutline,
    mdiPencilOutline,
    mdiTrashCanOutline,
  } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { t } from 'svelte-i18n';

  interface Props {
    post: PostResponseDto;
    onUpdate?: (post: PostResponseDto) => void;
    onDelete?: (post: PostResponseDto) => void;
  }

  let { post, onUpdate, onDelete }: Props = $props();

  let menuOpen = $state(false);
  const closeMenu = () => (menuOpen = false);

  const isOwner = $derived(authManager.user?.id === post.owner.id);
  const relativeTime = $derived(DateTime.fromISO(post.createdAt).toRelative() ?? '');
  const visibilityIcon = $derived(
    post.visibility === PostVisibility.Public
      ? mdiEarth
      : post.visibility === PostVisibility.Partners
        ? mdiAccountMultipleOutline
        : mdiLockOutline,
  );
  const visibilityLabel = $derived(
    post.visibility === PostVisibility.Public
      ? $t('visibility_public')
      : post.visibility === PostVisibility.Partners
        ? $t('visibility_partners')
        : post.visibility === PostVisibility.Specific
          ? $t('visibility_specific')
          : $t('visibility_private'),
  );

  const attachmentDetails = $derived(
    Promise.all(post.attachments.map((attachment) => getPostAttachmentDetails(post.id, attachment))),
  );

  const handleDelete = async () => {
    closeMenu();
    if (await deletePostAndNotify(post)) {
      onDelete?.(post);
    }
  };

  const handleEdit = async () => {
    closeMenu();
    const saved = await openPostComposer(post);
    if (saved) {
      onUpdate?.(saved);
    }
  };
</script>

<article
  class="flex flex-col gap-3 rounded-2xl border border-immich-fg/10 bg-immich-bg p-4 dark:border-immich-dark-fg/10 dark:bg-immich-dark-bg"
  aria-label={$t('post_by', { values: { name: post.owner.name } })}
>
  <header class="flex items-center gap-3">
    <UserAvatar user={post.owner} size="md" />
    <div class="flex min-w-0 flex-1 flex-col">
      <span class="truncate font-medium">{post.owner.name}</span>
      <span class="flex items-center gap-1 text-xs text-immich-fg/60 dark:text-immich-dark-fg/60">
        <time datetime={post.createdAt}>{relativeTime}</time>
        <span aria-hidden="true">·</span>
        <Icon icon={visibilityIcon} size="14" title={visibilityLabel} />
      </span>
    </div>
    {#if isOwner}
      <div class="relative" use:clickOutside={{ onOutclick: closeMenu, onEscape: closeMenu }}>
        <IconButton
          icon={mdiDotsVertical}
          title={$t('post_options')}
          aria-label={$t('post_options')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onclick={() => (menuOpen = !menuOpen)}
        />
        {#if menuOpen}
          <div
            role="menu"
            class="absolute right-0 z-10 mt-1 w-44 rounded-xl border border-immich-fg/10 bg-immich-bg py-1 shadow-lg dark:border-immich-dark-fg/10 dark:bg-immich-dark-bg"
          >
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-immich-fg/5 dark:hover:bg-immich-dark-fg/5"
              onclick={handleEdit}
            >
              <Icon icon={mdiPencilOutline} size="16" />
              {$t('edit')}
            </button>
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-immich-fg/5 dark:hover:bg-immich-dark-fg/5"
              onclick={handleDelete}
            >
              <Icon icon={mdiTrashCanOutline} size="16" />
              {$t('delete')}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </header>

  {#if post.body}
    <Markdown source={post.body} />
  {/if}

  {#await attachmentDetails then details}
    {@const assets = details.filter((detail) => detail.asset)}
    {@const albums = details.filter((detail) => detail.album)}
    {#if assets.length > 0}
      <div class="grid grid-cols-2 gap-2" role="list" aria-label={$t('post_attachments')}>
        {#each assets.slice(0, 4) as { asset } (asset!.id)}
          <div role="listitem">
            <a
              href={Route.viewAsset({ id: asset!.id })}
              class="relative block overflow-hidden rounded-xl"
              aria-label={asset!.originalFileName}
            >
              <img
                src={getAssetMediaUrl({ id: asset!.id, cacheKey: asset!.thumbhash, size: AssetMediaSize.Thumbnail })}
                alt={asset!.originalFileName}
                class="aspect-square w-full object-cover"
                loading="lazy"
              />
            </a>
          </div>
        {/each}
      </div>
      {#if assets.length > 4}
        <p class="text-xs text-immich-fg/60 dark:text-immich-dark-fg/60">
          {$t('post_more_attachments', { values: { count: assets.length - 4 } })}
        </p>
      {/if}
    {/if}
    {#if albums.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each albums as { album } (album!.id)}
          <a
            href={Route.viewAlbum({ id: album!.id })}
            class="flex items-center gap-2 rounded-full border border-immich-fg/10 px-3 py-1 text-sm hover:bg-immich-fg/5 dark:border-immich-dark-fg/10 dark:hover:bg-immich-dark-fg/5"
          >
            <Icon icon={mdiImageAlbum} size="16" />
            <span class="max-w-48 truncate">{album!.albumName}</span>
          </a>
        {/each}
      </div>
    {/if}
  {/await}

  <footer class="flex items-center gap-4 border-t border-immich-fg/10 pt-2 dark:border-immich-dark-fg/10">
    <PostLikeButton {post} {onUpdate} />
    <span class="flex items-center gap-1 text-sm text-immich-fg/70 dark:text-immich-dark-fg/70">
      <Icon icon={mdiCommentOutline} size="18" />
      {post.commentCount}
      <span class="sr-only">{$t('comments')}</span>
    </span>
  </footer>
</article>
