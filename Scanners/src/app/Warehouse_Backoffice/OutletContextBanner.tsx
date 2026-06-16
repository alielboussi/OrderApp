import type { ReactNode } from "react";
import styles from "./outlets.module.css";

type Props = {
  title?: string;
  children: ReactNode;
};

export function OutletContextBanner({ title = "Afterten Orders — outlet operations", children }: Props) {
  return (
    <div className={styles.banner}>
      <p className={styles.bannerTitle}>{title}</p>
      <p className={styles.bannerBody}>{children}</p>
    </div>
  );
}
