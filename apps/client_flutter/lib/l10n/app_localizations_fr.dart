// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appName => 'Furlife';

  @override
  String get tagline => 'Vos colis voyagent en confiance.';

  @override
  String get signInTitle => 'Connexion sécurisée';

  @override
  String get signInSubtitle =>
      'Entrez votre numéro de téléphone. Nous vous enverrons un code à usage unique.';

  @override
  String get phoneLabel => 'Numéro de téléphone';

  @override
  String get phoneInvalid =>
      'Entrez un numéro au format international, par exemple +221771234567.';

  @override
  String get sendCode => 'Recevoir mon code';

  @override
  String get signInPrivacy =>
      'Votre numéro sert à sécuriser votre compte et vos opérations Furlife.';

  @override
  String get otpTitle => 'Entrez le code reçu';

  @override
  String otpSubtitle(String phone) {
    return 'Un code à 6 chiffres a été envoyé au $phone.';
  }

  @override
  String get otpLabel => 'Code à 6 chiffres';

  @override
  String get verifyCode => 'Vérifier';

  @override
  String get logout => 'Se déconnecter';

  @override
  String connectedAs(String phone) {
    return 'Connecté avec $phone';
  }

  @override
  String get sendParcel => 'Envoyer un colis';

  @override
  String get sendParcelSubtitle =>
      'Bientôt disponible dans le prochain incrément.';

  @override
  String get myParcels => 'Mes colis';

  @override
  String get myParcelsSubtitle =>
      'Le suivi sera activé après le module commande.';
}
