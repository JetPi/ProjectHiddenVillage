using System.Security.Cryptography;

namespace ProjectHiddenVillage.Server;

public static class GameDeckShuffle
{
    public static void Shuffle(List<CardInstance> deck, Random? random = null)
    {
        ArgumentNullException.ThrowIfNull(deck);

        if (deck.Count <= 1)
        {
            return;
        }

        for (var index = deck.Count - 1; index > 0; index--)
        {
            var swapIndex = random is null
                ? RandomNumberGenerator.GetInt32(index + 1)
                : random.Next(index + 1);

            (deck[index], deck[swapIndex]) = (deck[swapIndex], deck[index]);
        }
    }
}
