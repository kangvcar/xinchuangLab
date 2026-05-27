import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import CourseIntro from "@/components/landing/CourseIntro";
import ProductPreview from "@/components/landing/ProductPreview";
import TrustStrip from "@/components/landing/TrustStrip";
import FeatureTabs from "@/components/landing/FeatureTabs";
import StepsSection from "@/components/landing/StepsSection";
import ComparisonSection from "@/components/landing/ComparisonSection";
import FAQSection from "@/components/landing/FAQSection";
import CTASection from "@/components/landing/CTASection";
import FooterSection from "@/components/landing/FooterSection";

export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-white text-[#666] relative">
      <Navbar />
      <HeroSection />
      <CourseIntro />
      <ProductPreview />
      <TrustStrip />
      <FeatureTabs />
      <StepsSection />
      <ComparisonSection />
      <FAQSection />
      <CTASection />
      <FooterSection />
    </main>
  );
}
