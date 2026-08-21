import 'package:client_flutter/features/auth/application/auth_providers.dart';
import 'package:client_flutter/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class PhoneSignInPage extends ConsumerStatefulWidget {
  const PhoneSignInPage({super.key});

  @override
  ConsumerState<PhoneSignInPage> createState() => _PhoneSignInPageState();
}

class _PhoneSignInPageState extends ConsumerState<PhoneSignInPage> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController(text: '+221');

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppLocalizations.of(context);
    final auth = ref.watch(authControllerProvider);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(strings.appName,
                        style: Theme.of(context).textTheme.headlineLarge),
                    const SizedBox(height: 12),
                    Text(strings.signInTitle,
                        style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 8),
                    Text(strings.signInSubtitle),
                    const SizedBox(height: 28),
                    TextFormField(
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      decoration: InputDecoration(
                        labelText: strings.phoneLabel,
                        hintText: '+221 77 123 45 67',
                      ),
                      validator: (value) {
                        final phone =
                            (value ?? '').replaceAll(RegExp(r'[\s()-]'), '');
                        return RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(phone)
                            ? null
                            : strings.phoneInvalid;
                      },
                      onFieldSubmitted: (_) => _submit(),
                    ),
                    if (auth.errorMessage != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        auth.errorMessage!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: auth.isBusy ? null : _submit,
                      child: auth.isBusy
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(strings.sendCode),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      strings.signInPrivacy,
                      style: Theme.of(context).textTheme.bodySmall,
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    await ref
        .read(authControllerProvider.notifier)
        .startPhone(_phoneController.text);
  }
}
