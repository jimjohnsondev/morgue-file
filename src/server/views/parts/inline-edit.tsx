// The pieces of in-place editing (R37): a link-styled button that opens a form where the value
// was, the form itself, and one-click actions. client/api-forms.ts sends each form to the server
// with the launch token and reloads the page once it is saved; nothing opens a dialog.
import type { ComponentChildren } from 'preact';

/** A link-styled button that opens the inline form with this id, in place of what it edits. */
export function EditButton(props: {
  readonly formId: string;
  readonly label: string;
  readonly name?: string;
}) {
  return (
    <button type="button" class="link-button" data-edit-open={props.formId} aria-label={props.name}>
      {props.label}
    </button>
  );
}

/** What an inline form shows while closed; opening its form hides it. */
export function EditView(props: { readonly formId: string; readonly children: ComponentChildren }) {
  return <span data-edit-view={props.formId}>{props.children}</span>;
}

/** Where the server's refusal shows, beside the form that was refused. */
function ApiResult() {
  return <span class="inline-form__result" role="status" data-api-result hidden />;
}

/** What an API form sends, and how it looks. */
export type ApiFormProps = {
  /** The address the form's fields go to, as JSON. */
  readonly action: string;
  readonly method?: 'POST' | 'DELETE';
  /** An inline form opened by an EditButton has its id and starts hidden. */
  readonly editId?: string;
  /** The id of a form that shows from the start, for fields in other cells to name it. */
  readonly id?: string;
  readonly label?: string;
  /** Where the page goes once the change is saved; it reloads itself without one. */
  readonly next?: string;
  /** A whole page's form, laid out as a block, which Ctrl+S sends (client/save-key.ts). */
  readonly isPageForm?: boolean;
  /** Saved without reloading the page, as the notes box is when it loses the focus. */
  readonly isSavedInPlace?: boolean;
  readonly children: ComponentChildren;
};

/** A form client/api-forms.ts posts with the token; the page reloads when the server says yes. */
export function ApiForm(props: ApiFormProps) {
  return (
    <form
      id={props.editId ?? props.id}
      class={props.isPageForm === true ? 'page-form' : 'inline-form'}
      data-api-form={props.action}
      data-api-method={props.method ?? 'POST'}
      data-api-next={props.next}
      data-api-stay={props.isSavedInPlace === true ? '' : undefined}
      data-save-key={props.isPageForm === true ? '' : undefined}
      data-edit-form={props.editId === undefined ? undefined : ''}
      hidden={props.editId !== undefined}
      aria-label={props.label}
    >
      {props.children}
      <ApiResult />
    </form>
  );
}

/** Save and cancel at the end of an inline form; cancel closes it and shows the value again. */
export function SaveOrCancel(props: { readonly saveLabel?: string }) {
  return (
    <>
      <button type="submit" class="button button--primary">
        {props.saveLabel ?? 'Save'}
      </button>{' '}
      <button type="button" class="link-button" data-edit-cancel>
        cancel
      </button>
    </>
  );
}

/** A one-click action drawn as a link (rescan, remove): a form with just its button. */
export function ApiAction(props: {
  readonly action: string;
  readonly method?: 'POST' | 'DELETE';
  readonly label: string;
  readonly name?: string;
}) {
  return (
    <ApiForm action={props.action} {...(props.method && { method: props.method })}>
      <button type="submit" class="link-button" aria-label={props.name}>
        {props.label}
      </button>
    </ApiForm>
  );
}

/** A label read out by screen readers but not drawn, for a field the table's heading names. */
export function HiddenLabel(props: { readonly for: string; readonly children: ComponentChildren }) {
  return (
    <label for={props.for} class="visually-hidden">
      {props.children}
    </label>
  );
}
