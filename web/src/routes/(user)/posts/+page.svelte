<script lang="ts">
  import emptyUrl from '$lib/assets/empty-1.svg';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import PostCard from '$lib/components/posts/PostCard.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/EmptyPlaceholder.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { getPosts, type PostResponseDto } from '@immich/sdk';
  import { Button } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  let posts = $state<PostResponseDto[]>(data.posts);
  let cursor = $derived(posts.length > 0 ? posts[posts.length - 1].id : undefined);
  let hasMore = $state(data.posts.length >= data.pageSize);
  let loading = $state(false);

  const loadMore = async () => {
    if (loading || !hasMore || !cursor) {
      return;
    }
    loading = true;
    try {
      const next = await getPosts({ cursor, limit: data.pageSize });
      posts = [...posts, ...next];
      hasMore = next.length >= data.pageSize;
    } catch (error) {
      handleError(error, $t('errors.error_loading_posts'));
    } finally {
      loading = false;
    }
  };

  const handleUpdate = (updated: PostResponseDto) => {
    posts = posts.map((post) => (post.id === updated.id ? updated : post));
  };

  const handleDelete = (deleted: PostResponseDto) => {
    posts = posts.filter((post) => post.id !== deleted.id);
  };
</script>

<UserPageLayout title={data.meta.title}>
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-8">
    {#if posts.length === 0}
      <EmptyPlaceholder src={emptyUrl} text={$t('posts_empty')} />
    {:else}
      {#each posts as post (post.id)}
        <PostCard {post} onUpdate={handleUpdate} onDelete={handleDelete} />
      {/each}
      {#if hasMore}
        <div class="flex justify-center pt-2">
          <Button color="secondary" onclick={loadMore} disabled={loading}>
            {loading ? $t('loading') : $t('load_more')}
          </Button>
        </div>
      {/if}
    {/if}
  </div>
</UserPageLayout>
