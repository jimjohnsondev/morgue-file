// An edit control drawn as the frames show it but not working yet: the editing PRs bring each
// one to life (tags 14, filing 13, model profiles 17, item fields 18).

/** A link-styled button for an edit action that isn't built yet, so it does nothing. */
export function PendingAction(props: { readonly label: string; readonly name?: string }) {
  return (
    <button type="button" class="link-button" disabled aria-label={props.name}>
      {props.label}
    </button>
  );
}
