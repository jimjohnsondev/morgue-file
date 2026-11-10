// An edit control drawn as the frames show it but with nothing to do, such as the [x] of a chip
// whose removal isn't built.

/** A link-styled button for an edit action that isn't built yet, so it does nothing. */
export function PendingAction(props: { readonly label: string; readonly name?: string }) {
  return (
    <button type="button" class="link-button" disabled aria-label={props.name}>
      {props.label}
    </button>
  );
}
