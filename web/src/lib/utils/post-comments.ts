import type { PostCommentResponseDto } from '@immich/sdk';

export type PostCommentNode = PostCommentResponseDto & { children: PostCommentNode[] };

/**
 * Build a nested comment tree from a flat server list.
 * - Top-level comments (and orphans whose parent is missing) sort oldest-first.
 * - Children sort oldest-first under their parent.
 */
export const buildCommentTree = (comments: PostCommentResponseDto[]): PostCommentNode[] => {
  const nodes = new Map<string, PostCommentNode>();
  for (const comment of comments) {
    nodes.set(comment.id, { ...comment, children: [] });
  }
  const roots: PostCommentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    // guard against self-referencing cycles so the util stays total
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const byCreatedAt = (a: PostCommentNode, b: PostCommentNode) => a.createdAt.localeCompare(b.createdAt);
  const sortRecursively = (list: PostCommentNode[]) => {
    list.sort(byCreatedAt);
    for (const node of list) {
      sortRecursively(node.children);
    }
  };
  sortRecursively(roots);
  return roots;
};
