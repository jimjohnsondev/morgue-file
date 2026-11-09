// An edit control drawn as the frames show it but not working yet: the PRs still to come bring
// each one to life (model tags on page ranges 21, backup and restore 24).

/** A link-styled button for an edit action that isn't built yet, so it does nothing. */
export function PendingAction(props: { readonly label: string; readonly name?: string }) {
  return (
    <button type="button" class="link-button" disabled aria-label={props.name}>
      {props.label}
    </button>
  );
}
