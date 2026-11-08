// The model a link is for (R15): choosing "New model…" in a model list shows the field for the
// new model's name beside it and moves the focus there; choosing a model hides it again.

/** The name field that goes with a model list, in the same form. */
function findNameField(choice: HTMLSelectElement): HTMLInputElement | undefined {
  return choice.form?.querySelector<HTMLInputElement>('[data-new-model-name]') ?? undefined;
}

document.addEventListener('change', (event) => {
  const choice = event.target;
  if (!(choice instanceof HTMLSelectElement) || choice.dataset.modelChoice === undefined) {
    return;
  }
  const nameField = findNameField(choice);
  if (nameField === undefined) {
    return;
  }
  const isNew = choice.value === 'new';
  nameField.hidden = !isNew;
  if (isNew) {
    nameField.focus();
  }
});
