<script lang="ts">
  import { getAssetMediaUrl } from '$lib/utils';
  import {
    AssetOrder,
    SearchOrderField,
    getAllAlbums,
    searchAssets,
    type AlbumResponseDto,
    type AssetResponseDto,
  } from '@immich/sdk';
  import { AssetMediaSize } from '@immich/sdk';
  import { Icon, LoadingSpinner } from '@immich/ui';
  import { mdiCheckCircle, mdiImageAlbum } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteMap } from 'svelte/reactivity';

  interface Props {
    selectedAssets: SvelteMap<string, AssetResponseDto>;
    selectedAlbums: SvelteMap<string, AlbumResponseDto>;
  }

  let { selectedAssets, selectedAlbums }: Props = $props();

  let tab = $state<'photos' | 'albums'>('photos');
  let assets = $state<AssetResponseDto[]>([]);
  let albums = $state<AlbumResponseDto[]>([]);
  let loading = $state(true);

  const toggleAsset = (asset: AssetResponseDto) => {
    if (selectedAssets.has(asset.id)) {
      selectedAssets.delete(asset.id);
    } else {
      selectedAssets.set(asset.id, asset);
    }
  };

  const toggleAlbum = (album: AlbumResponseDto) => {
    if (selectedAlbums.has(album.id)) {
      selectedAlbums.delete(album.id);
    } else {
      selectedAlbums.set(album.id, album);
    }
  };

  onMount(async () => {
    try {
      const [found, owned] = await Promise.all([
        searchAssets({
          metadataSearchDto: {
            size: 60,
            orderBy: { field: SearchOrderField.FileCreatedAt, direction: AssetOrder.Desc },
          },
        }),
        getAllAlbums({}),
      ]);
      assets = found.assets.items;
      albums = owned;
    } finally {
      loading = false;
    }
  });
</script>

<div class="flex flex-col gap-2">
  <div
    class="flex gap-1 rounded-xl bg-immich-fg/5 p-1 dark:bg-immich-dark-fg/5"
    role="tablist"
    aria-label={$t('post_attachments')}
  >
    <button
      type="button"
      role="tab"
      aria-selected={tab === 'photos'}
      class="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium {tab === 'photos'
        ? 'bg-immich-bg shadow dark:bg-immich-dark-bg'
        : 'opacity-60 hover:opacity-100'}"
      onclick={() => (tab = 'photos')}
    >
      {$t('photos')} ({selectedAssets.size})
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={tab === 'albums'}
      class="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium {tab === 'albums'
        ? 'bg-immich-bg shadow dark:bg-immich-dark-bg'
        : 'opacity-60 hover:opacity-100'}"
      onclick={() => (tab = 'albums')}
    >
      {$t('albums')} ({selectedAlbums.size})
    </button>
  </div>

  {#if loading}
    <div class="flex justify-center py-6"><LoadingSpinner /></div>
  {:else if tab === 'photos'}
    <div class="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto" role="tabpanel">
      {#each assets as asset (asset.id)}
        {@const selected = selectedAssets.has(asset.id)}
        <button
          type="button"
          class="relative overflow-hidden rounded-lg {selected ? 'ring-2 ring-immich-primary' : ''}"
          aria-pressed={selected}
          aria-label={asset.originalFileName}
          onclick={() => toggleAsset(asset)}
        >
          <img
            src={getAssetMediaUrl({ id: asset.id, cacheKey: asset.thumbhash, size: AssetMediaSize.Thumbnail })}
            alt=""
            class="aspect-square w-full object-cover"
            loading="lazy"
          />
          {#if selected}
            <span class="absolute right-1 top-1 rounded-full bg-immich-bg/90 dark:bg-immich-dark-bg/90">
              <Icon icon={mdiCheckCircle} size="20" class="text-immich-primary" />
            </span>
          {/if}
        </button>
      {:else}
        <p class="col-span-4 py-4 text-center text-sm opacity-60">{$t('no_photos_found')}</p>
      {/each}
    </div>
  {:else}
    <div class="flex max-h-64 flex-col gap-1 overflow-y-auto" role="tabpanel">
      {#each albums as album (album.id)}
        {@const selected = selectedAlbums.has(album.id)}
        <button
          type="button"
          class="flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-immich-fg/5 dark:hover:bg-immich-dark-fg/5 {selected
            ? 'bg-immich-primary/10 dark:bg-immich-dark-primary/10'
            : ''}"
          aria-pressed={selected}
          onclick={() => toggleAlbum(album)}
        >
          <Icon icon={mdiImageAlbum} size="20" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{album.albumName}</span>
            <span class="block text-xs opacity-60"
              >{$t('post_album_asset_count', { values: { count: album.assetCount } })}</span
            >
          </span>
          {#if selected}
            <Icon icon={mdiCheckCircle} size="20" class="text-immich-primary" />
          {/if}
        </button>
      {:else}
        <p class="py-4 text-center text-sm opacity-60">{$t('no_albums_found')}</p>
      {/each}
    </div>
  {/if}
</div>
