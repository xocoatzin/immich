import { getPosts } from '@immich/sdk';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

const pageSize = 20;

export const load = (async ({ url }) => {
  await authenticate(url);
  const posts = await getPosts({ limit: pageSize });
  const $t = await getFormatter();

  return {
    posts,
    pageSize,
    meta: {
      title: $t('posts'),
    },
  };
}) satisfies PageLoad;
