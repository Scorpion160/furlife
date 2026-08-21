import 'package:flutter/material.dart';
import 'package:partner_flutter/core/theme/furlife_theme.dart';
import 'package:partner_flutter/features/home/presentation/home_page.dart';

class FurlifePartnerApp extends StatelessWidget {
  const FurlifePartnerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Furlife Partner',
      theme: FurlifeTheme.light(),
      darkTheme: FurlifeTheme.dark(),
      themeMode: ThemeMode.system,
      home: const HomePage(),
    );
  }
}
