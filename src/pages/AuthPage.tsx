import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

export interface LoginFormValues {
  username: string;
  password: string;
}

export interface RegisterFormValues extends LoginFormValues {
  email: string;
}

export type AuthFieldErrors = Partial<Record<keyof RegisterFormValues, string>>;

interface AuthPageBaseProps {
  brand: string;
  brandImageSrc?: string;
  brandImageAlt?: string;
  backdropImageSrc?: string;
  backdropImageAlt?: string;
  heading: string;
  description: string;
  alternateLabel: string;
  /** When omitted, alternateLabel is rendered as explanatory text. */
  alternateHref?: string;
  /** Extra route offered below the form, such as signing in from a phone. */
  secondaryAction?: { label: string; href: string };
  submitLabel?: string;
  submitting?: boolean;
  fieldErrors?: AuthFieldErrors;
  formError?: string;
  /** Hide email for local first-run administrator setup. */
  showEmail?: boolean;
}

export interface LoginAuthPageProps extends AuthPageBaseProps {
  mode: 'login';
  defaultValues?: Partial<LoginFormValues>;
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
}

export interface RegisterAuthPageProps extends AuthPageBaseProps {
  mode: 'register';
  defaultValues?: Partial<RegisterFormValues>;
  onSubmit: (values: RegisterFormValues) => void | Promise<void>;
}

export type AuthPageProps = LoginAuthPageProps | RegisterAuthPageProps;

export function AuthPage(props: AuthPageProps) {
  const {
    brand,
    brandImageSrc,
    brandImageAlt = brand,
    backdropImageSrc,
    backdropImageAlt = '',
    heading,
    description,
    alternateLabel,
    alternateHref,
    secondaryAction,
    submitting = false,
    fieldErrors = {},
    formError,
  } = props;
  const isRegister = props.mode === 'register';
  const submitLabel = props.submitLabel ?? (isRegister ? 'Create account' : 'Sign in');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const loginValues: LoginFormValues = {
      username: String(data.get('username') ?? ''),
      password: String(data.get('password') ?? ''),
    };

    if (props.mode === 'register') {
      void props.onSubmit({
        ...loginValues,
        email: String(data.get('email') ?? ''),
      });
      return;
    }

    void props.onSubmit(loginValues);
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(20rem,1fr)_minmax(28rem,0.8fr)]">
      <div className="relative min-h-48 overflow-hidden bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-950 lg:min-h-screen">
        {backdropImageSrc && (
          <img
            src={backdropImageSrc}
            alt={backdropImageAlt}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/30" />
        <div className="relative flex h-full min-h-48 items-end p-6 text-white sm:p-10 lg:min-h-screen lg:p-12">
          <div className="flex items-center gap-3">
            {brandImageSrc && (
              <img src={brandImageSrc} alt={brandImageAlt} className="h-10 w-auto max-w-48 object-contain" />
            )}
            <span className="text-2xl font-semibold tracking-tight">{brand}</span>
          </div>
        </div>
      </div>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12" aria-labelledby="auth-heading">
        <Card className="w-full max-w-md border-0 shadow-none sm:border sm:shadow-sm">
          <CardHeader className="gap-2">
            <p className="text-sm font-medium text-muted-foreground">{brand}</p>
            <h1 id="auth-heading" className="text-3xl font-semibold tracking-tight">
              {heading}
            </h1>
            <CardDescription className="text-base">{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit} aria-busy={submitting || undefined}>
              {formError && (
                <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <Input
                name="username"
                label="Username"
                autoComplete="username"
                defaultValue={props.defaultValues?.username}
                error={fieldErrors.username}
                disabled={submitting}
                required
              />

              {isRegister && props.showEmail !== false && (
                <Input
                  name="email"
                  type="email"
                  label="Email"
                  autoComplete="email"
                  defaultValue={props.defaultValues?.email}
                  error={fieldErrors.email}
                  disabled={submitting}
                  required
                />
              )}

              <Input
                name="password"
                type="password"
                label="Password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                defaultValue={props.defaultValues?.password}
                error={fieldErrors.password}
                disabled={submitting}
                minLength={isRegister ? 10 : undefined}
                required
              />

              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting && <Spinner label="Submitting" className="h-4 w-4" />}
                {submitting ? 'Please wait' : submitLabel}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {alternateHref ? (
                  <a href={alternateHref} className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {alternateLabel}
                  </a>
                ) : alternateLabel}
              </p>

              {secondaryAction && (
                <a href={secondaryAction.href} className="block text-center text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {secondaryAction.label}
                </a>
              )}
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
