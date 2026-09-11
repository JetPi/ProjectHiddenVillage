using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    private static string BuildEffectOptionLabel(EffectSpec effectSpec)
    {
        return effectSpec.EffectType switch
        {
            EffectKind.Recovery => nameof(EffectKind.Recovery),
            EffectKind.Support => nameof(EffectKind.Support),
            _ => BuildTimingLabel(effectSpec.Timing),
        };
    }

    private static string BuildTimingLabel(EffectTiming timing)
    {
        var rawLabel = timing.ToString();
        if (string.IsNullOrEmpty(rawLabel))
        {
            return rawLabel;
        }

        var builder = new System.Text.StringBuilder(rawLabel.Length + 8);

        for (var index = 0; index < rawLabel.Length; index++)
        {
            var currentCharacter = rawLabel[index];

            if (index > 0 && char.IsUpper(currentCharacter))
            {
                var previousCharacter = rawLabel[index - 1];
                var nextCharacterIsLower = index + 1 < rawLabel.Length && char.IsLower(rawLabel[index + 1]);

                if (char.IsLower(previousCharacter) || nextCharacterIsLower)
                {
                    builder.Append(' ');
                }
            }

            builder.Append(currentCharacter);
        }

        return builder.ToString();
    }
}
