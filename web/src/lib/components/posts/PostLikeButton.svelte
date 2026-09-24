<script lang="ts">
  import { likePost, unlikePost, type PostResponseDto } from '@immich/sdk';
  import { IconButton } from '@immich/ui';
  import { mdiHeart, mdiHeartOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { handleError } from '$lib/utils/handle-error';

  interface Props {
    post: PostResponseDto;
    onUpdate?: (post: PostResponseDto) => void;
  }

  let { post, onUpdate }: Props = $props();

  let liked = $state(post.isLiked);
  let likeCount = $state(post.likeCount);
  let busy = $state(false);

  // keep local state in sync when the parent re-renders with a fresh post
  $effect(() => {
    liked = post.isLiked;
    likeCount = post.likeCount;
  });

  const toggle = async () => {
    if (busy) {
      return;
    }
    busy = true;
    const next = !liked;
    // optimistic update
    liked = next;
    likeCount += next ? 1 : -1;
    try {
      if (next) {
        const updated = await likePost({ id: post.id });
        liked = updated.isLiked;
        likeCount = updated.likeCount;
        onUpdate?.(updated);
      } else {
        // unlike returns 204 with no body
        await unlikePost({ id: post.id });
        onUpdate?.({ ...post, isLiked: false, likeCount });
      }
    } catch (error) {
      // roll back the optimistic update
      liked = post.isLiked;
      likeCount = post.likeCount;
      handleError(error, $t('errors.error_toggling_like'));
    } finally {
      busy = false;
    }
  };
</script>

<div class="flex items-center gap-1">
  <IconButton
    icon={liked ? mdiHeart : mdiHeartOutline}
    title={liked ? $t('unlike') : $t('like')}
    aria-label={liked ? $t('unlike') : $t('like')}
    aria-pressed={liked}
    color={liked ? 'danger' : 'secondary'}
    onclick={toggle}
    disabled={busy}
  />
  <span class="text-sm text-immich-fg/70 dark:text-immich-dark-fg/70" aria-live="polite">{likeCount}</span>
</div>
