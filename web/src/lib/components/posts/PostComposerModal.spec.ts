import {
  PostVisibility,
  UserAvatarColor,
  createPost,
  getAlbumInfo,
  getAllAlbums,
  getAssetInfo,
  searchAssets,
  searchUsers,
  updatePost,
  validatePost,
  type PostResponseDto,
  type SearchResponseDto,
  type UserResponseDto,
} from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { albumFactory } from '@test-data/factories/album-factory';
import { assetFactory } from '@test-data/factories/asset-factory';
import PostComposerModal from './PostComposerModal.svelte';

vi.mock('@immich/sdk', async () => {
  const sdk = await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk');
  return {
    ...sdk,
    createPost: vi.fn(),
    updatePost: vi.fn(),
    validatePost: vi.fn(),
    searchUsers: vi.fn(),
    searchAssets: vi.fn(),
    getAllAlbums: vi.fn(),
    getAssetInfo: vi.fn(),
    getAlbumInfo: vi.fn(),
  };
});

vi.mock('@immich/ui', async () => {
  const ui = await vi.importActual<typeof import('@immich/ui')>('@immich/ui');
  return {
    ...ui,
    toastManager: { danger: vi.fn() },
  };
});

const owner: UserResponseDto = {
  id: 'user-owner',
  email: 'owner@example.com',
  name: 'Owner',
  profileImagePath: '',
  avatarColor: UserAvatarColor.Primary,
  profileChangedAt: '2026-09-24T10:00:00.000Z',
};

const userDto = (id: string, name: string): UserResponseDto => ({
  id,
  email: `${id}@example.com`,
  name,
  profileImagePath: '',
  avatarColor: UserAvatarColor.Primary,
  profileChangedAt: '2026-09-24T10:00:00.000Z',
});

const post = (overrides: Partial<PostResponseDto> = {}): PostResponseDto => ({
  id: 'post-1',
  body: 'Hello world',
  visibility: PostVisibility.Private,
  owner,
  attachments: [],
  audience: [],
  likeCount: 0,
  commentCount: 0,
  isLiked: false,
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T10:00:00.000Z',
  ...overrides,
});

const asset = assetFactory.build({ id: 'asset-1', originalFileName: 'photo.jpg' });
const album = albumFactory.build({ id: 'album-1', albumName: 'Trip' });

const mockSearchResults = () => {
  vi.mocked(searchAssets).mockResolvedValue({ assets: { items: [asset] } } as SearchResponseDto);
  vi.mocked(getAllAlbums).mockResolvedValue([album]);
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(searchUsers).mockResolvedValue([]);
  vi.mocked(validatePost).mockResolvedValue({ warnings: [] });
  vi.mocked(getAssetInfo).mockResolvedValue(asset);
  vi.mocked(getAlbumInfo).mockResolvedValue(album);
  mockSearchResults();
});

describe('PostComposerModal', () => {
  it('creates a post with the entered body and default visibility', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const created = post({ id: 'post-new', body: 'My new post' });
    vi.mocked(createPost).mockResolvedValue({ ...created, warnings: [] });

    render(PostComposerModal, { props: { onClose } });

    await user.type(screen.getByLabelText('post_body'), 'My new post');
    await user.click(screen.getByRole('button', { name: 'post' }));

    expect(createPost).toHaveBeenCalledWith({
      postCreateDto: {
        body: 'My new post',
        visibility: PostVisibility.Private,
        audience: [],
        attachments: [],
      },
    });
    expect(onClose).toHaveBeenCalledWith({ ...created, warnings: [] });
  });

  it('edits a post, preserving its attachments in the update payload', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const existing = post({
      id: 'post-edit',
      body: 'Old body',
      visibility: PostVisibility.Partners,
      attachments: [
        { assetId: 'asset-1', albumId: null, position: 0 },
        { assetId: null, albumId: 'album-1', position: 1 },
      ],
    });
    const updated = { ...existing, body: 'Edited body', warnings: [] };
    vi.mocked(updatePost).mockResolvedValue(updated);

    render(PostComposerModal, { props: { post: existing, onClose } });

    expect(await screen.findByText('post_attachments (2)')).toBeInTheDocument();
    expect(screen.getByLabelText('post_body')).toHaveValue('Old body');

    await user.clear(screen.getByLabelText('post_body'));
    await user.type(screen.getByLabelText('post_body'), 'Edited body');
    await user.click(screen.getByRole('button', { name: 'save' }));

    expect(updatePost).toHaveBeenCalledWith({
      id: 'post-edit',
      postUpdateDto: {
        body: 'Edited body',
        visibility: PostVisibility.Partners,
        audience: [],
        attachments: [{ assetId: 'asset-1' }, { albumId: 'album-1' }],
      },
    });
    // prefill invoked the real attachment lookup (fails if prefill were skipped)
    expect(getAssetInfo).toHaveBeenCalledWith({ id: 'asset-1' });
    expect(getAlbumInfo).toHaveBeenCalledWith({ id: 'album-1' });
    expect(onClose).toHaveBeenCalledWith(updated);
  });

  it('keeps attachments that failed to load instead of dropping them', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const existing = post({
      id: 'post-unresolved',
      attachments: [{ assetId: 'asset-1', albumId: null, position: 0 }],
    });
    vi.mocked(getAssetInfo).mockRejectedValue(new Error('network down'));
    vi.mocked(updatePost).mockResolvedValue({ ...existing, warnings: [] });

    render(PostComposerModal, { props: { post: existing, onClose } });
    // the attachment failed to resolve, so it is kept as an unresolved entry
    expect(await screen.findByText('post_attachments (1)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'save' }));

    expect(updatePost).toHaveBeenCalledWith({
      id: 'post-unresolved',
      postUpdateDto: expect.objectContaining({
        // non-specific visibility submits an empty audience, never undefined
        audience: [],
        attachments: [{ assetId: 'asset-1', albumId: undefined }],
      }),
    });
  });

  it('shows validation warnings without blocking submit', async () => {
    vi.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const existing = post({
        id: 'post-warn',
        attachments: [{ assetId: 'asset-1', albumId: null, position: 0 }],
      });
      vi.mocked(validatePost).mockResolvedValue({ warnings: ['Attachment visible to fewer people'] });

      render(PostComposerModal, { props: { post: existing, onClose: vi.fn() } });
      await vi.advanceTimersByTimeAsync(700);

      expect(screen.getByText('Attachment visible to fewer people')).toBeInTheDocument();
      // warnings never block: submit stays enabled
      expect(screen.getByRole('button', { name: 'save' })).toBeEnabled();
      expect(validatePost).toHaveBeenCalledWith({
        postValidateDto: expect.objectContaining({
          visibility: PostVisibility.Private,
          // non-specific visibility validates with no audience
          audience: undefined,
          attachments: [{ assetId: 'asset-1' }],
        }),
      });

      await user.click(screen.getByRole('button', { name: 'save' }));
      expect(updatePost).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a stale validation response after attachments are removed', async () => {
    vi.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const existing = post({
        id: 'post-race',
        attachments: [{ assetId: 'asset-1', albumId: null, position: 0 }],
      });
      let resolveValidation!: (value: { warnings: string[] }) => void;
      vi.mocked(validatePost).mockReturnValue(
        new Promise((resolve) => {
          resolveValidation = resolve;
        }),
      );

      render(PostComposerModal, { props: { post: existing, onClose: vi.fn() } });
      // prefill resolves, validation request goes out and stays in flight
      await vi.advanceTimersByTimeAsync(700);
      expect(validatePost).toHaveBeenCalledTimes(1);

      // remove the only attachment while the request is in flight
      await user.click(screen.getByRole('button', { name: 'photo.jpg' }));
      await vi.advanceTimersByTimeAsync(700);

      // the late response must not repopulate warnings
      resolveValidation({ warnings: ['stale warning'] });
      await vi.advanceTimersByTimeAsync(0);

      expect(screen.queryByText('stale warning')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves edit-mode audience IDs to real users and marks the rest unavailable', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const existing = post({
      id: 'post-9',
      visibility: PostVisibility.Specific,
      audience: ['user-1', 'user-2'],
    });
    vi.mocked(searchUsers).mockResolvedValue([userDto('user-1', 'User One')]);
    vi.mocked(updatePost).mockResolvedValue({ ...existing, warnings: [] });

    render(PostComposerModal, { props: { post: existing, onClose } });

    expect(await screen.findByText('User One')).toBeInTheDocument();
    // user-2 has no user object: shown honestly, never fabricated
    expect(screen.getByText('post_audience_unavailable')).toBeInTheDocument();
    expect(screen.queryByText('user-2')).not.toBeInTheDocument();

    // both IDs are preserved in the submit payload for server-side validation
    await user.click(screen.getByRole('button', { name: 'save' }));
    expect(updatePost).toHaveBeenCalledWith({
      id: 'post-9',
      postUpdateDto: expect.objectContaining({ audience: ['user-1', 'user-2'] }),
    });
  });

  it('lets the author remove an unavailable audience member', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const existing = post({
      id: 'post-9',
      visibility: PostVisibility.Specific,
      audience: ['user-1', 'user-2'],
    });
    vi.mocked(searchUsers).mockResolvedValue([userDto('user-1', 'User One')]);
    vi.mocked(updatePost).mockResolvedValue({ ...existing, warnings: [] });

    render(PostComposerModal, { props: { post: existing, onClose } });
    expect(await screen.findByText('post_audience_unavailable')).toBeInTheDocument();

    const unavailableChip = screen.getByText('post_audience_unavailable').parentElement!;
    await user.click(within(unavailableChip).getByRole('button', { name: 'remove_user' }));

    expect(screen.queryByText('post_audience_unavailable')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'save' }));
    expect(updatePost).toHaveBeenCalledWith({
      id: 'post-9',
      postUpdateDto: expect.objectContaining({ audience: ['user-1'] }),
    });
  });

  it('blocks submit for specific visibility until an audience is picked', async () => {
    const user = userEvent.setup();
    const existing = post({ id: 'post-9', visibility: PostVisibility.Specific, audience: [] });
    vi.mocked(searchUsers).mockResolvedValue([userDto('user-1', 'User One')]);

    render(PostComposerModal, { props: { post: existing, onClose: vi.fn() } });
    await screen.findByText('User One');

    // no audience selected: submit is disabled
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();

    // pick the user from search results
    await user.click(screen.getByRole('button', { name: /User One/ }));
    expect(screen.getByRole('button', { name: 'save' })).toBeEnabled();
  });

  it('revalidates when the audience changes', async () => {
    vi.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const existing = post({
        id: 'post-aud-reval',
        visibility: PostVisibility.Specific,
        audience: ['user-1'],
        attachments: [{ assetId: 'asset-1', albumId: null, position: 0 }],
      });
      vi.mocked(searchUsers).mockResolvedValue([userDto('user-1', 'User One'), userDto('user-2', 'User Two')]);

      render(PostComposerModal, { props: { post: existing, onClose: vi.fn() } });
      await vi.advanceTimersByTimeAsync(700);

      expect(validatePost).toHaveBeenCalledTimes(1);
      expect(validatePost).toHaveBeenLastCalledWith({
        postValidateDto: expect.objectContaining({ audience: ['user-1'] }),
      });

      // pick a second audience member: validation must re-fire with both IDs
      await user.click(screen.getByRole('button', { name: /User Two/ }));
      await vi.advanceTimersByTimeAsync(700);

      expect(validatePost).toHaveBeenCalledTimes(2);
      expect(validatePost).toHaveBeenLastCalledWith({
        postValidateDto: expect.objectContaining({ audience: ['user-1', 'user-2'] }),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps pending audience IDs unverified when the user directory fails to load', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const existing = post({
      id: 'post-dir-fail',
      visibility: PostVisibility.Specific,
      audience: ['user-2'],
    });
    vi.mocked(searchUsers).mockRejectedValue(new Error('directory down'));
    vi.mocked(updatePost).mockResolvedValue({ ...existing, warnings: [] });

    render(PostComposerModal, { props: { post: existing, onClose } });
    // wait for the failed directory load to settle
    await screen.findByText('no_users_found');

    // never claims the user is unavailable when we simply could not check
    expect(screen.getByText('post_audience_unverified')).toBeInTheDocument();
    expect(screen.queryByText('post_audience_unavailable')).not.toBeInTheDocument();

    // the ID is still preserved for server-side validation
    await user.click(screen.getByRole('button', { name: 'save' }));
    expect(updatePost).toHaveBeenCalledWith({
      id: 'post-dir-fail',
      postUpdateDto: expect.objectContaining({ audience: ['user-2'] }),
    });
  });

  it('resolves edit-mode audience even when attachments delay the prefill', async () => {
    const existing = post({
      id: 'post-aud-order',
      visibility: PostVisibility.Specific,
      audience: ['user-1'],
      attachments: [{ assetId: 'asset-1', albumId: null, position: 0 }],
    });
    vi.mocked(searchUsers).mockResolvedValue([userDto('user-1', 'User One')]);

    render(PostComposerModal, { props: { post: existing, onClose: vi.fn() } });
    // wait for the attachment prefill, which delays the composer's onMount
    await screen.findByText('post_attachments (1)');

    // the audience member resolves to a real chip, never an unavailable one
    await waitFor(() => {
      const region = document.querySelector('[aria-label="post_audience"]');
      expect(region && within(region as HTMLElement).queryByText('User One')).toBeInTheDocument();
    });
    expect(screen.queryByText('post_audience_unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('post_audience_unverified')).not.toBeInTheDocument();
  });
});
