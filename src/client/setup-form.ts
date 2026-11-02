// The first-run setup page: Check and Save send the form to the server and show its answer.
// Writes need the launch token in a header, which a plain form post can't send.

type ServerAnswer = {
  readonly isOk: boolean;
  readonly message: string;
};

/** Reads the per-launch token the server put in the page's meta tag. */
function readToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="morgue-token"]')?.content ?? '';
}

/** Posts JSON with the token and returns the server's message, whether it said yes or no. */
async function postJson(url: string, body: Record<string, string>): Promise<ServerAnswer> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-morgue-token': readToken() },
    body: JSON.stringify(body),
  });
  const answer = (await response.json()) as { message?: string };
  return { isOk: response.ok, message: answer.message ?? 'Something went wrong. Try again.' };
}

/** Shows an answer in the result line it belongs to: cyan when it's fine, magenta when not. */
function showAnswer(form: HTMLFormElement, resultName: string, answer: ServerAnswer): void {
  const line = form.querySelector<HTMLElement>(`[data-setup-result="${resultName}"]`);
  if (line === null) {
    return;
  }
  line.textContent = answer.message;
  line.classList.toggle('notice--ok', answer.isOk);
  line.classList.toggle('notice--problem', !answer.isOk);
  line.hidden = false;
}

/** Reads a text field of the form by name. */
function readField(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value : '';
}

/** Runs one Check button: reference checks the Reference folder, data the chosen data folder. */
async function runCheck(form: HTMLFormElement, check: string): Promise<void> {
  const isReference = check === 'reference';
  const url = isReference ? '/api/setup/check-reference' : '/api/setup/check-data';
  const folder = readField(form, isReference ? 'referenceDir' : 'chosenDataDir');
  showAnswer(form, check, await postJson(url, { folder }));
}

/** Saves the choices, then opens Home once the server has switched over. */
async function save(form: HTMLFormElement): Promise<void> {
  const answer = await postJson('/api/setup/save', {
    referenceDir: readField(form, 'referenceDir'),
    dataChoice: readField(form, 'dataChoice'),
    chosenDataDir: readField(form, 'chosenDataDir'),
  });
  showAnswer(form, 'save', answer);
  if (answer.isOk) {
    window.location.assign('/');
  }
}

/** Hooks the Check buttons and Save to the form. */
function bindSetupForm(form: HTMLFormElement): void {
  for (const button of form.querySelectorAll<HTMLButtonElement>('[data-setup-check]')) {
    button.addEventListener('click', () => {
      void runCheck(form, button.dataset.setupCheck ?? 'reference');
    });
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void save(form);
  });
}

const setupForm = document.querySelector<HTMLFormElement>('[data-setup-form]');
if (setupForm !== null) {
  bindSetupForm(setupForm);
}
