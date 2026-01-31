'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/routing';
import { trackCalculatorInteraction } from './advisor-analytics';

interface ROICalculation {
  hoursStuck: number;
  hourlyRate: number;
  monthlySavings: number;
  weeklyCost: number;
  advisorCost: number;
  netSavings: number;
  roiPercentage: number;
  paybackTime: string;
}

interface InteractiveROICalculatorProps {
  className?: string;
}

export function InteractiveROICalculator({ className = '' }: InteractiveROICalculatorProps) {
  const [hoursStuck, setHoursStuck] = useState(5);
  const [hourlyRate, setHourlyRate] = useState(75);
  const [calculation, setCalculation] = useState<ROICalculation | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Calculate ROI based on inputs
  const calculateROI = useCallback((hours: number, rate: number): ROICalculation => {
    const weeklyCost = hours * rate;
    const monthlyCost = weeklyCost * 4;
    
    // Assume 30-minute session every 2 weeks ($19 each) for regular guidance
    const advisorCost = 19 * 2; // $38 per month
    
    // Assume 50% reduction in stuck time with advisor help
    const timeReduction = 0.5;
    const monthlySavings = monthlyCost * timeReduction;
    const netSavings = monthlySavings - advisorCost;
    const roiPercentage = advisorCost > 0 ? (netSavings / advisorCost) * 100 : 0;
    
    // Calculate payback time
    const paybackMonths = advisorCost / (monthlySavings / 4); // weeks to payback
    const paybackTime = paybackMonths < 1 
      ? `${Math.ceil(paybackMonths * 7)} days`
      : paybackMonths < 4 
        ? `${Math.ceil(paybackMonths)} weeks`
        : `${Math.ceil(paybackMonths / 4)} months`;

    return {
      hoursStuck: hours,
      hourlyRate: rate,
      monthlySavings,
      weeklyCost,
      advisorCost,
      netSavings,
      roiPercentage,
      paybackTime
    };
  }, []);

  // Update calculation when inputs change
  useEffect(() => {
    const calc = calculateROI(hoursStuck, hourlyRate);
    setCalculation(calc);
    
    if (hasInteracted) {
      // Track calculator usage after user interaction
      trackCalculatorInteraction(hoursStuck, hourlyRate, calc.monthlySavings);
    }
  }, [hoursStuck, hourlyRate, calculateROI, hasInteracted]);

  const handleHoursChange = (value: number) => {
    setHoursStuck(value);
    setHasInteracted(true);
  };

  const handleRateChange = (value: number) => {
    setHourlyRate(Math.max(10, Math.min(500, value))); // Clamp between $10-$500
    setHasInteracted(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(amount));
  };

  if (!calculation) return null;

  return (
    <Card className={`p-8 !bg-gray-800 !border-gray-700 ${className}`} style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
      <div className="space-y-6">
        {/* Input Controls */}
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Hours stuck per week: <span className="text-white font-semibold">{hoursStuck}</span> hours
            </label>
            <input 
              type="range" 
              min="1" 
              max="25" 
              value={hoursStuck}
              onChange={(e) => handleHoursChange(parseInt(e.target.value))}
              className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1 hour</span>
              <span>25+ hours</span>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Your hourly rate
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">$</span>
              <input 
                type="number" 
                min="10"
                max="500"
                value={hourlyRate}
                onChange={(e) => handleRateChange(parseInt(e.target.value) || 0)}
                className="w-full pl-8 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="75"
              />
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Range: $10 - $500 per hour
            </div>
          </div>
        </div>

        {/* Results Display */}
        <div className="pt-4 border-t border-gray-700">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Primary Result */}
            <div className="text-center md:text-left">
              <div className="text-2xl font-bold text-green-400 mb-2">
                {formatCurrency(calculation.netSavings)}/month
              </div>
              <p className="text-gray-300 text-sm">
                Net savings with expert guidance
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 justify-center md:justify-start">
                <Icon name="calculator" className="w-4 h-4" />
                <span>Payback time: {calculation.paybackTime}</span>
              </div>
            </div>

            {/* ROI Metrics */}
            <div className="text-center md:text-right">
              <div className="text-xl font-semibold text-primary mb-2">
                {Math.round(calculation.roiPercentage)}% ROI
              </div>
              <p className="text-gray-300 text-sm mb-3">
                Return on investment
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs"
              >
                <Icon name={showDetails ? "eye-off" : "eye"} className="w-3 h-3 me-1" />
                {showDetails ? "Hide" : "Show"} breakdown
              </Button>
            </div>
          </div>

          {/* Detailed Breakdown */}
          {showDetails && (
            <div className="mt-6 pt-4 border-t border-gray-700">
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div className="bg-gray-900/50 p-3 rounded">
                  <div className="font-medium text-red-400">Current Cost</div>
                  <div className="text-gray-300 mt-1">
                    {formatCurrency(calculation.monthlySavings * 2)}/month being stuck
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {hoursStuck}h/week × ${hourlyRate}/h × 4 weeks
                  </div>
                </div>
                
                <div className="bg-gray-900/50 p-3 rounded">
                  <div className="font-medium text-yellow-400">Advisor Cost</div>
                  <div className="text-gray-300 mt-1">
                    {formatCurrency(calculation.advisorCost)}/month
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    2 sessions × $19 each
                  </div>
                </div>
                
                <div className="bg-gray-900/50 p-3 rounded">
                  <div className="font-medium text-green-400">Time Saved</div>
                  <div className="text-gray-300 mt-1">
                    {formatCurrency(calculation.monthlySavings)}/month
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    50% reduction in stuck time
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CTA Section */}
        <div className="pt-6 border-t border-gray-700 text-center">
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {calculation.roiPercentage > 500 && (
              <Badge variant="default" className="bg-green-600">
                <Icon name="trending-up" className="w-3 h-3 me-1" />
                Excellent ROI
              </Badge>
            )}
            {calculation.netSavings > 1000 && (
              <Badge variant="outline" className="!text-yellow-400 !border-yellow-400">
                <Icon name="dollar-sign" className="w-3 h-3 me-1" />
                High Impact
              </Badge>
            )}
            {hoursStuck > 10 && (
              <Badge variant="outline" className="!text-red-400 !border-red-400">
                <Icon name="clock" className="w-3 h-3 me-1" />
                Time Critical
              </Badge>
            )}
          </div>
          
          <div className="space-y-3">
            <p className="text-sm text-gray-400">
              Based on helping 500+ developers get unstuck faster
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild size="lg" className="px-6">
                <Link href="/advisors">
                  <Icon name="search" className="w-4 h-4 me-2" />
                  Find Expert Now
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="px-6">
                <Link href="#advisor-matcher">
                  <Icon name="message-square" className="w-4 h-4 me-2" />
                  Describe Challenge
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Preset scenarios for quick selection
export function ROIPresetScenarios() {
  const scenarios = [
    {
      title: "Junior Developer",
      hours: 3,
      rate: 45,
      icon: "user",
      description: "New to the field, occasional blockers"
    },
    {
      title: "Mid-Level Engineer",
      hours: 5,
      rate: 75,
      icon: "code",
      description: "Complex features, architecture decisions"
    },
    {
      title: "Senior Developer",
      hours: 4,
      rate: 120,
      icon: "shield",
      description: "System design, performance optimization"
    },
    {
      title: "Tech Lead",
      hours: 6,
      rate: 150,
      icon: "users",
      description: "Team decisions, technical strategy"
    }
  ];

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-white mb-3">Quick Scenarios</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {scenarios.map((scenario) => (
          <button
            key={scenario.title}
            className="p-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-left transition-colors group"
            onClick={() => {
              // This would trigger the calculator to update with preset values
              // Implementation would require passing callback from parent
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon name={scenario.icon as any} className="w-4 h-4 text-primary" />
              <span className="font-medium text-white text-sm">{scenario.title}</span>
            </div>
            <div className="text-xs text-gray-400">
              {scenario.hours}h/week • ${scenario.rate}/h
            </div>
            <div className="text-xs text-gray-500 mt-1 group-hover:text-gray-400">
              {scenario.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}