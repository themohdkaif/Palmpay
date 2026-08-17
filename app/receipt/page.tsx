"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ReceiptCard } from "@/components/ReceiptCard";
import { PageTransition } from "@/components/PageTransition";
import { usePalmPayStore } from "@/lib/store";
import gsap from "gsap";

export default function ReceiptPage() {
  const router = useRouter();
  const { identifiedCustomer, amount, authorizeResult, resetFlow } = usePalmPayStore();

  useEffect(() => {
    // If user lands on receipt page directly without completed payment, redirect to home
    if (!identifiedCustomer || !authorizeResult) {
      router.push("/");
    }
  }, [identifiedCustomer, authorizeResult, router]);

  const handleDoneAndReset = () => {
    // GSAP page exit transition back to Home
    const receiptContainer = document.getElementById("receipt-page-container");
    if (receiptContainer) {
      gsap.to(receiptContainer, {
        opacity: 0,
        y: 20,
        duration: 0.4,
        ease: "power2.in",
        onComplete: () => {
          resetFlow();
          router.push("/");
        },
      });
    } else {
      resetFlow();
      router.push("/");
    }
  };

  if (!identifiedCustomer || !authorizeResult) {
    return null;
  }

  return (
    <PageTransition>
      <div id="receipt-page-container" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 flex flex-col items-center justify-center">
        <ReceiptCard
          customer={identifiedCustomer}
          amount={amount}
          paymentResult={authorizeResult}
          onReset={handleDoneAndReset}
        />
      </div>
    </PageTransition>
  );
}
