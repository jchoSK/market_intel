
"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, KeyRound, Loader2, LogIn } from 'lucide-react';
import Image from 'next/image';
import { useToast } from "@/hooks/use-toast";

const ACCESS_GRANTED_FLAG_KEY = 'app_access_granted_flag_v1';
const AUTH_TOKEN_KEY = 'app_auth_token_v1';

function AppLoginLogic() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already "logged in" via sessionStorage, redirect
    const hasAccess = sessionStorage.getItem(ACCESS_GRANTED_FLAG_KEY) === 'true';
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (hasAccess && token) {
      const redirectPath = searchParams.get('redirect') || '/';
      router.replace(redirectPath);
    }
  }, [router, searchParams]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/verify-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.success && data.token) {
        sessionStorage.setItem(ACCESS_GRANTED_FLAG_KEY, 'true');
        sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
        toast({ title: "Login Successful", description: "Welcome!" });
        const redirectPath = searchParams.get('redirect') || '/';
        router.replace(redirectPath);
      } else {
        setError(data.error || "Invalid password or server error.");
        toast({ variant: "destructive", title: "Login Failed", description: data.error || "Invalid password." });
      }
    } catch (err) {
      console.error('Login API call error:', err);
      setError("An error occurred during login. Please try again.");
      toast({ variant: "destructive", title: "Login Failed", description: "Could not connect to the server." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <Image
            src="/searchkings-crown-stylized.png"
            alt="SearchKings Crown Logo"
            width={70}
            height={37}
            className="mx-auto mb-4"
            style={{ height: 'auto' }}
            priority
            data-ai-hint="crown logo"
          />
          <CardTitle className="text-3xl font-bold text-primary">Market Intel - Customer Tool</CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter the site access password.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <form onSubmit={handleSubmit} className="space-y-6" suppressHydrationWarning={true}>
            <div className="space-y-1.5">
              <Label htmlFor="password-app" className="text-base font-medium flex items-center">
                <KeyRound className="mr-2 h-5 w-5 text-muted-foreground" />
                Password
              </Label>
              <Input
                id="password-app"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="text-lg"
                placeholder="Enter access password"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="flex items-center space-x-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full text-lg py-6 bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-6 w-6" />
              )}
              {isLoading ? "Verifying..." : "Enter Site"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Market Intel - Customer Tool. All rights reserved.
      </p>
    </div>
  );
}

// Wrapper component to include Suspense boundary
export default function AppLoginPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="mr-2 h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading Login Page...</p>
      </div>
    }>
      <AppLoginLogic />
    </Suspense>
  );
}
