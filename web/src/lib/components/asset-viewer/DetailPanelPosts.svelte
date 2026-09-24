<script lang="ts">
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { Route } from '$lib/route';
  import { getPosts, type AssetResponseDto, type PostResponseDto } from '@immich/sdk';
  import { Text } from '@immich/ui';
  import { DateTime } from 'luxon';
  import { t } from 'svelte-i18n';
  import { handleError } from '$lib/utils/handle-error';

  interface Props {
    asset: AssetResponseDto;
  }

  let { asset }: Props = $props();

  const fetchPosts = async (assetId: string): Promise<PostResponseDto[]> => {
    try {
      return await getPosts({ assetId });
    } catch (error) {
      handleError(error, 'Error getting asset post membership');
      return [];
    }
  };

  let posts = $derived(fetchPosts(asset.id));

  const excerpt = (body: string) => (body.length > 140 ? `${body.slice(0, 140)}…` : body);
</script>

{#await posts then posts}
  {#if posts.length > 0}
    <section class="p-6 dark:text-immich-dark-fg">
      <div class="pb-4">
        <Text size="small" color="muted">{$t('appears_in_posts')}</Text>
      </div>
      <div class="flex flex-col gap-3">
        {#each posts as post (post.id)}
          <a
            href={Route.posts()}
            class="flex items-center gap-3 rounded-xl p-2 hover:bg-immich-fg/5 dark:hover:bg-immich-dark-fg/5"
          >
            <UserAvatar user={post.owner} size="md" />
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">
                {post.owner.name}
                <span class="ms-2 font-normal opacity-60">
                  {DateTime.fromISO(post.createdAt).toRelative() ?? ''}
                </span>
              </p>
              <p class="truncate text-sm opacity-70">{excerpt(post.body)}</p>
            </div>
          </a>
        {/each}
      </div>
    </section>
  {/if}
{/await}
