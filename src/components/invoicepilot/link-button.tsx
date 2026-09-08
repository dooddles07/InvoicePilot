import Link from "next/link";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";

/**
 * A button that navigates.
 *
 * Base UI's Button assumes a native `<button>` unless told otherwise; handing
 * it an anchor without `nativeButton={false}` silently strips button
 * semantics. Routing every link-styled-as-button through here means that flag
 * is set once instead of being forgotten at one of thirty call sites.
 */
export function LinkButton({
  href,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "render" | "nativeButton"> & {
  href: string;
}) {
  return (
    <Button
      {...props}
      nativeButton={false}
      render={<Link href={href} />}
    >
      {children}
    </Button>
  );
}
