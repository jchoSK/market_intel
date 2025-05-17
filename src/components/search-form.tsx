"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, LocateFixed, MapPin, Search, Loader2 } from "lucide-react";

const formSchema = z.object({
  category: z.string().min(2, {
    message: "Business category must be at least 2 characters.",
  }).max(50, {
    message: "Business category must not exceed 50 characters.",
  }),
  location: z.string().min(2, {
    message: "Location must be at least 2 characters.",
  }).max(50, {
    message: "Location must not exceed 50 characters.",
  }),
  radius: z.coerce.number().min(1, {
    message: "Radius must be at least 1.",
  }).max(50, {
    message: "Radius cannot exceed 50.",
  }),
});

type SearchFormValues = z.infer<typeof formSchema>;

interface SearchFormProps {
  onSubmit: (data: SearchFormValues) => Promise<void>;
  isLoading: boolean;
}

export default function SearchForm({ onSubmit, isLoading }: SearchFormProps) {
  const form = useForm<SearchFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: "",
      location: "",
      radius: 5,
    },
  });

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Find Businesses</CardTitle>
        <CardDescription>Enter your criteria to start analyzing the market.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">
                    <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    Business Category
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Restaurants, Plumbers" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">
                    <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                    Location
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., New York, Toronto" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="radius"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">
                    <LocateFixed className="mr-2 h-4 w-4 text-muted-foreground" />
                    Search Radius (miles)
                  </FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 5" {...field} />
                  </FormControl>
                  <FormDescription>
                    Enter the radius for your search (1-50 miles).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {isLoading ? "Searching..." : "Search"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
