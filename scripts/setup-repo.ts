// One-time GitHub setup: repo settings, the main-branch ruleset and the baseline label.
// Run once with admin rights: node scripts/setup-repo.ts <owner/repo>
// It is safe to run again; each step replaces what it set before.
import { execFileSync } from 'node:child_process';

/** The ci.yml jobs every pull request must pass before it can merge. */
const REQUIRED_CHECKS = [
  'pr-title',
  'lint-typecheck',
  'unit',
  'e2e',
  'visual',
  'perf',
  'baseline-guard',
] as const;

const RULESET_NAME = 'main';
const BASELINE_LABEL = 'baseline-approved';

/** Runs `gh api` with a JSON body and returns its parsed output. */
function ghApi(method: string, endpoint: string, body?: unknown): unknown {
  const args = ['api', '--method', method, endpoint];
  if (body !== undefined) {
    args.push('--input', '-');
  }
  const output = execFileSync('gh', args, {
    input: body === undefined ? '' : JSON.stringify(body),
    encoding: 'utf8',
  });
  return output.trim() === '' ? undefined : (JSON.parse(output) as unknown);
}

/** Squash merges only, auto-merge on, branches deleted after merging. */
function applyRepoSettings(repo: string): void {
  ghApi('PATCH', `repos/${repo}`, {
    allow_auto_merge: true,
    allow_squash_merge: true,
    allow_merge_commit: false,
    allow_rebase_merge: false,
    delete_branch_on_merge: true,
    squash_merge_commit_title: 'PR_TITLE',
    squash_merge_commit_message: 'PR_BODY',
  });
}

/** The ruleset for main: PRs and green checks required, linear history, no bypass list. */
function mainRuleset(): unknown {
  return {
    name: RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      { type: 'required_linear_history' },
      {
        type: 'pull_request',
        parameters: {
          required_approving_review_count: 0,
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_review_thread_resolution: false,
          allowed_merge_methods: ['squash'],
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: false,
          required_status_checks: REQUIRED_CHECKS.map((context) => ({ context })),
        },
      },
    ],
  };
}

/** Creates the main ruleset, or replaces it if an earlier run made one. */
function applyRuleset(repo: string): void {
  const existing = ghApi('GET', `repos/${repo}/rulesets`) as { id: number; name: string }[];
  const previous = existing.find((ruleset) => ruleset.name === RULESET_NAME);
  if (previous === undefined) {
    ghApi('POST', `repos/${repo}/rulesets`, mainRuleset());
  } else {
    ghApi('PUT', `repos/${repo}/rulesets/${String(previous.id)}`, mainRuleset());
  }
}

/** Creates the label only Jim adds, which lets a PR change screenshot baselines. */
function applyBaselineLabel(repo: string): void {
  const labels = ghApi('GET', `repos/${repo}/labels?per_page=100`) as { name: string }[];
  if (labels.some((label) => label.name === BASELINE_LABEL)) {
    return;
  }
  ghApi('POST', `repos/${repo}/labels`, {
    name: BASELINE_LABEL,
    color: 'd61f92',
    description: 'Jim approved the screenshot changes in this PR',
  });
}

/** Says whether the RELEASE_TOKEN secret exists yet; it has to be created by hand. */
function hasReleaseToken(repo: string): boolean {
  const secrets = ghApi('GET', `repos/${repo}/actions/secrets`) as { secrets: { name: string }[] };
  return secrets.secrets.some((secret) => secret.name === 'RELEASE_TOKEN');
}

/** Applies every setting in order and reports what is left to do by hand. */
function main(): void {
  const repo = process.argv[2];
  if (!repo?.includes('/')) {
    console.error('Usage: node scripts/setup-repo.ts <owner/repo>');
    process.exit(1);
  }
  applyRepoSettings(repo);
  console.info('Repo settings: squash only, auto-merge on, delete branches on merge.');
  applyRuleset(repo);
  console.info(`Ruleset on main: PRs required; checks ${REQUIRED_CHECKS.join(', ')}.`);
  applyBaselineLabel(repo);
  console.info(`Label: ${BASELINE_LABEL}.`);
  if (!hasReleaseToken(repo)) {
    console.info('Still to do by hand: add the RELEASE_TOKEN secret (see docs/ARCHITECTURE.md).');
  }
}

main();
