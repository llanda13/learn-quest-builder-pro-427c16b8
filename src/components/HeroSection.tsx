import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, FileText, Target, Zap } from "lucide-react";
import heroImage from "@/assets/hero-education.jpg";

interface HeroSectionProps {
  onGetStarted?: () => void;
  onLearnMore?: () => void;
}

export const HeroSection = ({ onGetStarted, onLearnMore }: HeroSectionProps) => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img 
          src={heroImage} 
          alt="Students studying in a modern classroom setting" 
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-secondary/60 to-accent/40"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center">
        {/* Main Heading */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6">
          <span className="block text-white">Transform Your</span>
          <span className="block text-white">Teaching Experience</span>
        </h1>

        {/* Subheading */}
        <p className="text-xl md:text-2xl text-white/90 mb-12 max-w-3xl mx-auto">
          Create comprehensive assessments aligned with Bloom's Taxonomy using advanced AI. 
          Build smarter tests that truly measure student understanding.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-6 justify-center mb-16">
          <Button 
            size="lg" 
            onClick={onGetStarted}
            className="text-lg px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
          >
            <Target className="w-5 h-5 mr-2" />
            Start Building Tests
          </Button>
          <Button 
            variant="outline" 
            size="lg" 
            onClick={onLearnMore}
            className="text-lg px-8 py-4 border-2 border-white/40 text-white bg-white/10 backdrop-blur-sm hover:bg-white/20 hover:border-white/60 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
          >
            Learn More
          </Button>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardContent className="p-6 text-center">
              <Target className="w-12 h-12 text-primary mb-4 mx-auto" />
              <h3 className="text-lg font-semibold text-white mb-2">TOS Builder</h3>
              <p className="text-white/80 text-sm">Create detailed Table of Specifications</p>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardContent className="p-6 text-center">
              <Brain className="w-12 h-12 text-secondary mb-4 mx-auto" />
              <h3 className="text-lg font-semibold text-white mb-2">AI Questions</h3>
              <p className="text-white/80 text-sm">Generate intelligent questions</p>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardContent className="p-6 text-center">
              <FileText className="w-12 h-12 text-accent mb-4 mx-auto" />
              <h3 className="text-lg font-semibold text-white mb-2">Question Bank</h3>
              <p className="text-white/80 text-sm">Organize your question library</p>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardContent className="p-6 text-center">
              <Zap className="w-12 h-12 text-orange-400 mb-4 mx-auto" />
              <h3 className="text-lg font-semibold text-white mb-2">Instant Export</h3>
              <p className="text-white/80 text-sm">Export tests in multiple formats</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};