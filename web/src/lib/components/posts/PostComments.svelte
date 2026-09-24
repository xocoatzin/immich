<script lang="ts">
  import Markdown from '$lib/components/posts/Markdown.svelte';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { buildCommentTree, type PostCommentNode } from '$lib/utils/post-comments';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { createPostComment, deletePostComment, getPostComments, type PostResponseDto } from '@immich/sdk';
  import { Icon, LoadingSpinner, modalManager, toastManager } from '@immich/ui';
  import { mdiClose, mdiDeleteOutline, mdiReplyOutline, mdiSend } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    post: PostResponseDto;
    commentCount: number;
    /** Called whenever the comment count changes (create/delete). */
    onCountChange?: (count: number) => void;
  }

  let { post, commentCount, onCountChange }: Props = $props();

  const currentUserId = $derived(authManager.user?.id);

  let loading = $state(true);
  let tree = $state<PostCommentNode[]>([]);
  let count = $state(commentCount);
  let newBody = $state('');
  let submitting = $state(false);
  /** Comment id currently showing an inline reply box, if any. */
  let replyingTo = $state<string | undefined>();
  let replyBody = $state('');
  let replySubmitting = $state(false);

  const setCount = (next: number) => {
    count = next;
    onCountChange?.(next);
  };

  const countSubtree = (node: PostCommentNode): number =>
    1 + node.children.reduce((sum, child) => sum + countSubtree(child), 0);

  const removeNode = (nodes: PostCommentNode[], id: string): PostCommentNode[] => {
    const result: PostCommentNode[] = [];
    for (const node of nodes) {
      if (node.id === id) {
        continue;
      }
      result.push({ ...node, children: removeNode(node.children, id) });
    }
    return result;
  };

  const appendNode = (nodes: PostCommentNode[], node: PostCommentNode): PostCommentNode[] => {
    if (!node.parentId) {
      return [...nodes, node];
    }
    return nodes.map((existing) =>
      existing.id === node.parentId
        ? { ...existing, children: [...existing.children, node] }
        : { ...existing, children: appendNode(existing.children, node) },
    );
  };

  onMount(async () => {
    try {
      tree = buildCommentTree(await getPostComments({ id: post.id }));
    } catch (error) {
      handleError(error, $t('errors.error_loading_comments'));
    } finally {
      loading = false;
    }
  });

  const submitComment = async () => {
    const body = newBody.trim();
    if (!body || submitting) {
      return;
    }
    submitting = true;
    try {
      const created = await createPostComment({ id: post.id, postCommentCreateDto: { body } });
      tree = appendNode(tree, { ...created, children: [] });
      setCount(count + 1);
      newBody = '';
    } catch (error) {
      handleError(error, $t('errors.error_creating_comment'));
    } finally {
      submitting = false;
    }
  };

  const submitReply = async (parent: PostCommentNode) => {
    const body = replyBody.trim();
    if (!body || replySubmitting) {
      return;
    }
    replySubmitting = true;
    try {
      const created = await createPostComment({
        id: post.id,
        postCommentCreateDto: { body, parentId: parent.id },
      });
      tree = appendNode(tree, { ...created, children: [] });
      setCount(count + 1);
      replyBody = '';
      replyingTo = undefined;
    } catch (error) {
      handleError(error, $t('errors.error_creating_comment'));
    } finally {
      replySubmitting = false;
    }
  };

  const deleteComment = async (node: PostCommentNode) => {
    const confirmed = await modalManager.showDialog({
      title: $t('delete_comment'),
      prompt: $t('delete_comment_confirmation'),
      confirmText: $t('delete'),
    });
    if (!confirmed) {
      return;
    }
    try {
      await deletePostComment({ id: post.id, commentId: node.id });
      setCount(count - countSubtree(node));
      tree = removeNode(tree, node.id);
      toastManager.success($t('comment_deleted'));
    } catch (error) {
      handleError(error, $t('errors.error_deleting_comment'));
    }
  };
</script>

{#snippet commentNode(node: PostCommentNode)}
  <div role="listitem" class="flex gap-2" class:ms-6={node.depth > 1} class:mt-3={node.depth > 1}>
    <UserAvatar user={node.user} size="sm" />
    <div class="min-w-0 flex-1">
      <div class="rounded-xl bg-immich-fg/5 px-3 py-2 dark:bg-immich-dark-fg/5">
        <div class="flex items-baseline justify-between gap-2">
          <span class="truncate text-sm font-medium">{node.user.name}</span>
          <time class="shrink-0 text-xs text-immich-fg/60 dark:text-immich-dark-fg/60" datetime={node.createdAt}>
            {DateTime.fromISO(node.createdAt).toRelative() ?? ''}
          </time>
        </div>
        <div class="text-sm break-words">
          <Markdown source={node.body} />
        </div>
      </div>
      <div class="mt-1 flex items-center gap-3 px-1 text-xs">
        {#if node.depth < 3}
          <button
            type="button"
            class="flex items-center gap-1 text-immich-fg/60 hover:text-immich-primary dark:text-immich-dark-fg/60"
            onclick={() => {
              replyingTo = replyingTo === node.id ? undefined : node.id;
              replyBody = '';
            }}
          >
            <Icon icon={mdiReplyOutline} size="14" />
            {$t('reply')}
          </button>
        {/if}
        {#if node.user.id === currentUserId || post.owner.id === currentUserId}
          <button
            type="button"
            class="flex items-center gap-1 text-immich-fg/60 hover:text-red-500 dark:text-immich-dark-fg/60"
            onclick={() => deleteComment(node)}
          >
            <Icon icon={mdiDeleteOutline} size="14" />
            {$t('delete')}
          </button>
        {/if}
      </div>
      {#if replyingTo === node.id}
        <div class="mt-2 flex items-start gap-2">
          <textarea
            class="flex-1 resize-y rounded-xl border border-immich-fg/15 bg-transparent px-3 py-2 text-sm focus:border-immich-primary focus:outline-none dark:border-immich-dark-fg/15"
            rows="2"
            placeholder={$t('write_a_reply')}
            bind:value={replyBody}
            aria-label={$t('write_a_reply')}></textarea>
          <button
            type="button"
            class="rounded-full p-2 text-immich-primary hover:bg-immich-primary/10 disabled:opacity-40"
            disabled={replyBody.trim().length === 0 || replySubmitting}
            onclick={() => submitReply(node)}
            aria-label={$t('send_reply')}
          >
            <Icon icon={mdiSend} size="18" />
          </button>
          <button
            type="button"
            class="rounded-full p-2 text-immich-fg/60 hover:bg-immich-fg/5 dark:text-immich-dark-fg/60"
            onclick={() => (replyingTo = undefined)}
            aria-label={$t('cancel')}
          >
            <Icon icon={mdiClose} size="18" />
          </button>
        </div>
      {/if}
      {#if node.children.length > 0}
        <div role="list" class="flex flex-col">
          {#each node.children as child (child.id)}
            {@render commentNode(child)}
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/snippet}

<div class="mt-3 border-t border-immich-fg/10 pt-3 dark:border-immich-dark-fg/10">
  <div class="flex items-start gap-2">
    <textarea
      class="flex-1 resize-y rounded-xl border border-immich-fg/15 bg-transparent px-3 py-2 text-sm focus:border-immich-primary focus:outline-none dark:border-immich-dark-fg/15"
      rows="2"
      placeholder={$t('write_a_comment')}
      bind:value={newBody}
      aria-label={$t('write_a_comment')}></textarea>
    <button
      type="button"
      class="rounded-full p-2 text-immich-primary hover:bg-immich-primary/10 disabled:opacity-40"
      disabled={newBody.trim().length === 0 || submitting}
      onclick={submitComment}
      aria-label={$t('post_comment')}
    >
      <Icon icon={mdiSend} size="18" />
    </button>
  </div>

  {#if loading}
    <div class="flex justify-center py-4"><LoadingSpinner /></div>
  {:else if tree.length === 0}
    <p class="py-3 text-center text-sm opacity-60">{$t('no_comments_yet')}</p>
  {:else}
    <div role="list" class="mt-3 flex flex-col gap-3">
      {#each tree as node (node.id)}
        {@render commentNode(node)}
      {/each}
    </div>
  {/if}
</div>
