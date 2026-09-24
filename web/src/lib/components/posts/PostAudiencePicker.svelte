<script lang="ts">
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { normalizeSearchString } from '$lib/utils/string-utils';
  import { searchUsers, type UserResponseDto } from '@immich/sdk';
  import { Icon, ListButton, LoadingSpinner } from '@immich/ui';
  import { mdiClose } from '@mdi/js';
  import { sortBy } from 'lodash-es';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteMap } from 'svelte/reactivity';

  interface Props {
    selected: SvelteMap<string, UserResponseDto>;
  }

  let { selected }: Props = $props();

  let search = $state('');
  let users = $state<UserResponseDto[]>([]);
  let loading = $state(true);

  const filteredUsers = $derived(
    sortBy(
      users.filter(
        (user) => !selected.has(user.id) && normalizeSearchString(user.name).includes(normalizeSearchString(search)),
      ),
      ['name'],
    ),
  );

  const remove = (id: string) => selected.delete(id);

  onMount(async () => {
    try {
      users = await searchUsers();
      // backfill real user objects for pre-selected (edit-mode) entries
      for (const user of users) {
        if (selected.has(user.id)) {
          selected.set(user.id, user);
        }
      }
    } finally {
      loading = false;
    }
  });
</script>

<div class="flex flex-col gap-2">
  {#if selected.size > 0}
    <div class="flex flex-wrap gap-2" aria-label={$t('post_audience')}>
      {#each [...selected.values()] as user (user.id)}
        <span
          class="flex items-center gap-1.5 rounded-full bg-immich-primary/10 py-1 pe-2 ps-1 text-sm dark:bg-immich-dark-primary/20"
        >
          <UserAvatar {user} size="sm" />
          <span class="max-w-40 truncate">{user.name}</span>
          <button
            type="button"
            class="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
            aria-label={$t('remove_user')}
            onclick={() => remove(user.id)}
          >
            <Icon icon={mdiClose} size="14" />
          </button>
        </span>
      {/each}
    </div>
  {/if}

  <input
    class="rounded-xl border border-immich-fg/15 bg-transparent px-3 py-2 text-sm focus:border-immich-primary focus:outline-none dark:border-immich-dark-fg/15"
    placeholder={$t('search_users')}
    bind:value={search}
    aria-label={$t('search_users')}
  />

  {#if loading}
    <div class="flex justify-center py-4"><LoadingSpinner /></div>
  {:else}
    <div class="flex max-h-48 flex-col gap-1 overflow-y-auto">
      {#each filteredUsers.slice(0, 20) as user (user.id)}
        <ListButton onclick={() => selected.set(user.id, user)}>
          <UserAvatar {user} size="md" />
          <span class="truncate">{user.name}</span>
        </ListButton>
      {:else}
        <p class="px-2 py-3 text-center text-sm opacity-60">{$t('no_users_found')}</p>
      {/each}
    </div>
  {/if}
</div>
