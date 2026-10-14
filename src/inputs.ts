import { z } from 'zod';
export const revision = z.string().min(1).max(200)
  .regex(/^[A-Za-z0-9_./-]+$/, 'Use a SHA, tag, or branch name.');
export const repositoryPath = z.string().min(1).max(1024).refine(path =>
  !/[\\\u0000-\u001f\u007f]/.test(path) &&
  path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..'),
  'Use a relative repository file path without empty, dot, or parent segments.');
export const fileInput = z.object({
  path: repositoryPath, ref: revision,
  startLine: z.number().int().positive().default(1),
  maxLines: z.number().int().min(1).max(300).default(200)
});
export const commentsInput = z.object({
  number: z.number().int().positive(), page: z.number().int().min(1).max(1000).default(1)
});
