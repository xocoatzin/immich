import {
  deletePost,
  getAlbumInfo,
  getAssetInfo,
  type AlbumResponseDto,
  type AssetResponseDto,
  type PostAttachmentResponseDto,
  type PostResponseDto,
} from '@immich/sdk';
import { modalManager, toastManager } from '@immich/ui';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';

export type PostAttachmentDetails = {
  attachment: PostAttachmentResponseDto;
  asset?: AssetResponseDto;
  album?: AlbumResponseDto;
};

const attachmentCache = new Map<string, Promise<PostAttachmentDetails>>();

const loadAttachment = async (attachment: PostAttachmentResponseDto): Promise<PostAttachmentDetails> => {
  const details: PostAttachmentDetails = { attachment };
  const [asset, album] = await Promise.all([
    attachment.assetId ? getAssetInfo({ id: attachment.assetId }).catch(() => undefined) : undefined,
    attachment.albumId ? getAlbumInfo({ id: attachment.albumId }).catch(() => undefined) : undefined,
  ]);
  if (asset) {
    details.asset = asset;
  }
  if (album) {
    details.album = album;
  }
  return details;
};

/** Resolve attachment display data (asset/album), cached per attachment position. */
export const getPostAttachmentDetails = (
  postId: string,
  attachment: PostAttachmentResponseDto,
): Promise<PostAttachmentDetails> => {
  const key = `${postId}:${attachment.position}:${attachment.assetId ?? ''}:${attachment.albumId ?? ''}`;
  let pending = attachmentCache.get(key);
  if (!pending) {
    pending = loadAttachment(attachment);
    attachmentCache.set(key, pending);
  }
  return pending;
};

export const deletePostAndNotify = async (post: PostResponseDto): Promise<boolean> => {
  const $t = await getFormatter();
  const confirmed = await modalManager.showDialog({
    title: $t('delete_post'),
    prompt: $t('delete_post_confirmation'),
    confirmText: $t('delete'),
  });
  if (!confirmed) {
    return false;
  }
  try {
    await deletePost({ id: post.id });
    toastManager.success($t('post_deleted'));
    return true;
  } catch (error) {
    handleError(error, $t('errors.error_deleting_post'));
    return false;
  }
};
