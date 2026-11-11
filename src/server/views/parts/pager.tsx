// The page links of an Index page: « Prev 1 2 3 4 5 … 13 Next ». Each keeps the scroll position,
// and ← and → follow Prev and Next.
import { pagerSlots } from '../pager-slots.js';

/** What the pager needs: the current page, the last page, and how to link to any page. */
export type PagerProps = {
  readonly page: number;
  readonly lastPage: number;
  readonly hrefFor: (page: number) => string;
};

/** Prev and Next are plain text where there is no page to go to. */
export function Pager(props: PagerProps) {
  const { page, lastPage, hrefFor } = props;
  return (
    <span class="pager">
      «{' '}
      {page > 1 ? (
        <a href={hrefFor(page - 1)} rel="prev" data-key-link="previous" data-keep-scroll>
          Prev
        </a>
      ) : (
        'Prev'
      )}
      {pagerSlots(page, lastPage).map((slot, index) => {
        if (slot.kind === 'gap') {
          return <span key={`gap-${String(index)}`}>…</span>;
        }
        return slot.page === page ? (
          <b key={slot.page} class="pager__current">
            {slot.page}
          </b>
        ) : (
          <a key={slot.page} href={hrefFor(slot.page)} data-keep-scroll>
            {slot.page}
          </a>
        );
      })}
      {page < lastPage ? (
        <a href={hrefFor(page + 1)} rel="next" data-key-link="next" data-keep-scroll>
          Next
        </a>
      ) : (
        'Next'
      )}{' '}
      »
    </span>
  );
}
