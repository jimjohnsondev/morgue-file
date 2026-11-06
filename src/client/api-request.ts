// Sends a write to the server with the launch token, which every write needs (R27), and turns
// the answer into what the page shows: the JSON it sent back, or a refusal in the server's words.

const NO_SERVER_MESSAGE =
  "Morgue File isn't answering. Start it again with its shortcut, then reload this page.";

const REFUSED_MESSAGE = 'That change could not be saved. Check the values and try again.';

/** What the server said: its JSON answer if it saved the change, else the message to show. */
export type ApiAnswer =
  | { readonly isSaved: true; readonly answer: unknown }
  | { readonly isSaved: false; readonly message: string };

/** Reads the per-launch token the server put in the page's meta tag. */
function readToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="morgue-token"]')?.content ?? '';
}

/** The JSON a response holds, or undefined if it holds none (a 204, a proxy's page). */
async function readJson(response: Response): Promise<unknown> {
  if (response.headers.get('content-type')?.includes('application/json') !== true) {
    return undefined;
  }
  try {
    return await response.json();
  } catch {
    // A body cut short: the change was answered, so report what the status says.
    return undefined;
  }
}

/** Sends a write, with a JSON body if there is one, and says whether it was saved. */
export async function sendToApi(
  url: string,
  request: { readonly method: 'POST' | 'DELETE'; readonly body?: object },
): Promise<ApiAnswer> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method,
      headers: {
        'x-morgue-token': readToken(),
        ...(request.body && { 'content-type': 'application/json' }),
      },
      ...(request.body && { body: JSON.stringify(request.body) }),
    });
  } catch {
    // No answer at all: most likely the "Morgue File server" window was closed.
    return { isSaved: false, message: NO_SERVER_MESSAGE };
  }
  const answer = await readJson(response);
  if (response.ok) {
    return { isSaved: true, answer };
  }
  const message = (answer as { message?: unknown } | undefined)?.message;
  return { isSaved: false, message: typeof message === 'string' ? message : REFUSED_MESSAGE };
}
