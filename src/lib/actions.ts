"use server";

import type { Business } from "@/types";
import { z } from "zod";

const searchSchema = z.object({
  category: z.string().min(1, "Category is required").max(100, "Category is too long"),
  location: z.string().min(1, "Location is required").max(100, "Location is too long"),
  radius: z.coerce.number().min(1, "Radius must be at least 1").max(50, "Radius cannot exceed 50"),
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function searchBusinessesAction(
  params: { category: string; location: string; radius: number }
): Promise<Business[]> {
  const validation = searchSchema.safeParse(params);
  if (!validation.success) {
    const firstError = Object.values(validation.error.flatten().fieldErrors)[0]?.[0];
    throw new Error(firstError || "Invalid search parameters.");
  }

  const { category, location, radius } = validation.data;

  await delay(1500); // Simulate API call latency

  if (category.toLowerCase() === "error") {
    throw new Error("Simulated server error: Could not connect to the search service.");
  }

  if (category.toLowerCase() === "noresults") {
    return [];
  }
  
  const mockResults: Business[] = [
    {
      id: "1",
      name: `Awesome ${category} in ${location}`,
      address: `123 Main St, ${location}, USA`,
      phoneNumber: "555-1234",
      website: "https://example.com",
      rating: 4.5,
      reviewsCount: 150,
      isAdWordsCustomer: Math.random() > 0.5,
    },
    {
      id: "2",
      name: `Superb ${category} Services`,
      address: `456 Oak Ave, ${location}, USA`,
      phoneNumber: "555-5678",
      website: "https://another-example.com",
      rating: 4.8,
      reviewsCount: 220,
      isAdWordsCustomer: Math.random() > 0.5,
    },
    {
      id: "3",
      name: `${category} Hub Central`,
      address: `789 Pine Ln, ${location} (Radius: ${radius} miles)`,
      phoneNumber: "555-9012",
      website: "https://hub-example.com",
      rating: 4.2,
      reviewsCount: 90,
      isAdWordsCustomer: Math.random() > 0.5,
    },
    {
      id: "4",
      name: `The ${location} ${category} Experts`,
      address: `101 Market Blvd, ${location}, USA`,
      rating: 3.9,
      reviewsCount: 75,
      isAdWordsCustomer: Math.random() > 0.3,
    },
     {
      id: "5",
      name: `Budget ${category} Solutions ${location}`,
      address: `22 Industrial Park, ${location}, USA`,
      phoneNumber: "555-0000",
      website: "https://budget.example.com",
      rating: 3.5,
      reviewsCount: 40,
      isAdWordsCustomer: Math.random() > 0.7,
    }
  ];
  
  // Simulate some filtering based on actual parameters
  return mockResults.filter(b => 
    b.name.toLowerCase().includes(category.toLowerCase()) || 
    b.address.toLowerCase().includes(location.toLowerCase())
  ).slice(0, Math.floor(Math.random() * 5) + 1); // Return a random number of results up to 5
}
