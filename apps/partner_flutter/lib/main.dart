import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:partner_flutter/app/app.dart';
import 'package:partner_flutter/core/config/app_config.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  AppConfig.fromEnvironment();
  runApp(const ProviderScope(child: FurlifePartnerApp()));
}
