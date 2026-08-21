import 'package:client_flutter/app/router.dart';
import 'package:client_flutter/core/theme/furlife_theme.dart';
import 'package:client_flutter/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class FurlifeClientApp extends ConsumerWidget {
  const FurlifeClientApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'Furlife',
      theme: FurlifeTheme.light(),
      darkTheme: FurlifeTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: router,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
