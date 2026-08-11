using System.Text.RegularExpressions;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server;

public sealed partial class GameEffectHandlingService : IGameEffectHandlingService
{
	[GeneratedRegex(@"<br\s*/?>", RegexOptions.IgnoreCase)]
	private static partial Regex BrTagRegex();

	public string ExtractRecoveryEffect(string description)
	{
		if (string.IsNullOrWhiteSpace(description))
		{
			return string.Empty;
		}

		const string marker = "[Recovery]";
		var index = description.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
		if (index < 0)
		{
			return string.Empty;
		}

		return description[(index + marker.Length)..].Trim();
	}

	public string ExtractMainEffect(string description)
	{
		if (string.IsNullOrWhiteSpace(description))
		{
			return string.Empty;
		}

		const string supportMarker = "[Support]";
		const string recoveryMarker = "[Recovery]";

		var supportIndex = description.IndexOf(supportMarker, StringComparison.OrdinalIgnoreCase);
		var recoveryIndex = description.IndexOf(recoveryMarker, StringComparison.OrdinalIgnoreCase);

		var endIndex = description.Length;
		if (supportIndex >= 0)
		{
			endIndex = supportIndex;
		}

		if (recoveryIndex >= 0)
		{
			endIndex = Math.Min(endIndex, recoveryIndex);
		}

		var mainEffectSegment = description[..endIndex];
		var withoutBrTags = BrTagRegex().Replace(mainEffectSegment, " ");
		return withoutBrTags.Trim();
	}
}
