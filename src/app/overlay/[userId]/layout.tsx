// Route-specific layout for overlay - excludes Starfield and Header
// This ensures the overlay has a truly transparent background
import styles from './overlay-layout.module.css';

export default function OverlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.container}>
      {children}
    </div>
  );
}
