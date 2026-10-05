// Lets the server send the top of the page straight away while it checks who's signed in and
// builds the page, so the loading screen (BootLoader) shows instead of a blank screen.
export default function Loading() {
  return <div data-boot-wait aria-busy="true" className="min-h-dvh" />;
}
