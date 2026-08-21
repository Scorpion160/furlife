import 'package:client_flutter/app/app.dart';
import 'package:client_flutter/core/config/app_config.dart';
import 'package:client_flutter/features/auth/application/auth_providers.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final config = AppConfig.fromEnvironment();
  runApp(
    ProviderScope(
      overrides: [appConfigProvider.overrideWithValue(config)],
      child: const FurlifeClientApp(),
    ),
  );
}
