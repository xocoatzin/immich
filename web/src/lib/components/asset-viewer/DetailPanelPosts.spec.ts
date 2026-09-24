import { getPosts, PostVisibility, UserAvatarColor, type PostResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/svelte';
import { vi } from 'vitest';
import { assetFactory } from '@test-data/factories/asset-factory';
import DetailPanelPosts from './DetailPanelPosts.svelte';

vi.mock('@immich/sdk', async () => {
  const sdk = await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk');
  return {
    ...sdk,
    getPosts: vi.fn(),
  };
});

vi.mock('@immich/ui', async () => {
  const ui = await vi.importActual<typeof import('@immich/ui')>('@immich/ui');
  return {
    ...ui,
    toastManager: { danger: vi.fn() },
  };
});

const getPostsMock = vi.mocked(getPosts);

const post = (overrides: Partial<PostResponseDto> = {}): PostResponseDto => ({
  id: 'post-1',
  body: 'A lovely day at the lake with friends',
  visibility: PostVisibility.Public,
  owner: {
    id: 'user-1',
    email: 'jane@example.com',
    name: 'Jane Doe',
    profileImagePath: '',
    avatarColor: UserAvatarColor.Primary,
    profileChangedAt: '2026-09-24T10:00:00.000Z',
  },
  attachments: [],
  likeCount: 0,
  commentCount: 0,
  isLiked: false,
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T10:00:00.000Z',
  ...overrides,
});

const asset = assetFactory.build({ id: 'asset-1' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DetailPanelPosts', () => {
  it('lists posts containing the asset', async () => {
    getPostsMock.mockResolvedValue([post({ id: 'post-1' }), post({ id: 'post-2', body: 'Second post' })]);

    const { container } = render(DetailPanelPosts, { props: { asset } });

    await waitFor(() => expect(screen.getByText('A lovely day at the lake with friends')).toBeInTheDocument());
    expect(getPostsMock).toHaveBeenCalledWith({ assetId: 'asset-1' });
    expect(container.querySelector('section')).not.toBeNull();
    expect(screen.getByText('Second post')).toBeInTheDocument();
    expect(screen.getAllByText('Jane Doe')).toHaveLength(2);
    const links = container.querySelectorAll('section a[href="/posts"]');
    expect(links).toHaveLength(2);
  });

  it('truncates long post bodies', async () => {
    getPostsMock.mockResolvedValue([post({ body: 'x'.repeat(200) })]);

    render(DetailPanelPosts, { props: { asset } });

    await waitFor(() => expect(screen.getByText(`${'x'.repeat(140)}…`)).toBeInTheDocument());
  });

  it('renders nothing when no posts contain the asset', async () => {
    getPostsMock.mockResolvedValue([]);

    const { container } = render(DetailPanelPosts, { props: { asset } });

    await waitFor(() => expect(getPostsMock).toHaveBeenCalled());
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders nothing when the request fails', async () => {
    getPostsMock.mockRejectedValue(new Error('forbidden'));

    const { container } = render(DetailPanelPosts, { props: { asset } });

    await waitFor(() => expect(getPostsMock).toHaveBeenCalled());
    expect(container.querySelector('section')).toBeNull();
  });

  it('refetches when the asset changes', async () => {
    getPostsMock.mockResolvedValue([]);

    const { rerender } = render(DetailPanelPosts, { props: { asset } });
    await waitFor(() => expect(getPostsMock).toHaveBeenCalledWith({ assetId: 'asset-1' }));

    await rerender({ asset: assetFactory.build({ id: 'asset-2' }) });
    await waitFor(() => expect(getPostsMock).toHaveBeenCalledWith({ assetId: 'asset-2' }));
  });
});
