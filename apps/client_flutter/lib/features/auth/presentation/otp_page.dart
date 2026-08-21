import 'package:client_flutter/features/auth/application/auth_providers.dart';
import 'package:client_flutter/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class OtpPage extends ConsumerStatefulWidget {
  const OtpPage({super.key});

  @override
  ConsumerState<OtpPage> createState() => _OtpPageState();
}

class _OtpPageState extends ConsumerState<OtpPage> {
  final _codeController = TextEditingController();

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppLocalizations.of(context);
    final auth = ref.watch(authControllerProvider);
    final challenge = auth.pendingChallenge;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: auth.isBusy
              ? null
              : () =>
                  ref.read(authControllerProvider.notifier).cancelChallenge(),
          icon: const Icon(Icons.arrow_back),
          tooltip: MaterialLocalizations.of(context).backButtonTooltip,
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(strings.otpTitle,
                      style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  Text(strings.otpSubtitle(challenge?.phoneE164 ?? '')),
                  const SizedBox(height: 28),
                  TextField(
                    controller: _codeController,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(6),
                    ],
                    decoration: InputDecoration(labelText: strings.otpLabel),
                    onSubmitted: (_) => _verify(),
                  ),
                  if (auth.errorMessage != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      auth.errorMessage!,
                      style:
                          TextStyle(color: Theme.of(context).colorScheme.error),
                    ),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: auth.isBusy ? null : _verify,
                    child: auth.isBusy
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(strings.verifyCode),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _verify() async {
    if (_codeController.text.length != 6) return;
    await ref
        .read(authControllerProvider.notifier)
        .verifyCode(_codeController.text);
  }
}
