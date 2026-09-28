import Nav from '@/components/Nav.tsx';
import Footer from '@/components/Footer.tsx';

// Every normal page gets the floating nav and the footer. The /live stage does not.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  );
}
