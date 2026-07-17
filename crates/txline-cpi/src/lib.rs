#![forbid(unsafe_code)]

use anchor_lang::prelude::*;

// Pinned from txodds/tx-on-chain commit
// eba4cb4d578bdb5cfad3c22dfd134f012496e445, devnet IDL v1.5.6.
pub const PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    86, 117, 159, 44, 144, 95, 120, 96, 200, 99, 119, 20, 191, 36, 145, 48, 157, 192, 113, 129, 81,
    63, 122, 36, 191, 62, 218, 248, 127, 119, 80, 3,
]);
pub const VALIDATE_STAT_V2_DISCRIMINATOR: [u8; 8] = [208, 215, 194, 214, 241, 71, 246, 178];
pub const VALIDATE_ODDS_DISCRIMINATOR: [u8; 8] = [192, 19, 91, 138, 104, 100, 212, 86];
pub const VALIDATE_FIXTURE_DISCRIMINATOR: [u8; 8] = [231, 129, 218, 86, 223, 114, 21, 126];
pub const DAILY_SCORES_SEED: &[u8] = b"daily_scores_roots";
pub const DAILY_ODDS_SEED: &[u8] = b"daily_batch_roots";
pub const TEN_DAILY_FIXTURES_SEED: &[u8] = b"ten_daily_fixtures_roots";
pub const MILLIS_PER_DAY: i64 = 86_400_000;
pub const FINAL_PERIOD: i32 = 100;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Odds {
    pub fixture_id: i64,
    pub message_id: String,
    pub ts: i64,
    pub bookmaker: String,
    pub bookmaker_id: i32,
    pub super_odds_type: String,
    pub game_state: Option<String>,
    pub in_running: bool,
    pub market_parameters: Option<String>,
    pub market_period: Option<String>,
    pub price_names: Vec<String>,
    pub prices: Vec<i32>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct OddsUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct OddsBatchSummary {
    pub fixture_id: i64,
    pub update_stats: OddsUpdateStats,
    pub odds_sub_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct OddsValidationInput {
    pub odds_snapshot: Odds,
    pub summary: OddsBatchSummary,
    pub sub_tree_proof: Vec<ProofNode>,
    pub main_tree_proof: Vec<ProofNode>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Fixture {
    pub ts: i64,
    pub start_time: i64,
    pub competition: String,
    pub competition_id: i32,
    pub fixture_group_id: i32,
    pub participant1_id: i32,
    pub participant1: String,
    pub participant2_id: i32,
    pub participant2: String,
    pub fixture_id: i64,
    pub participant1_is_home: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct FixtureUpdateStats {
    pub update_count: u32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct FixtureBatchSummary {
    pub fixture_id: i64,
    pub competition_id: i32,
    pub competition: String,
    pub update_stats: FixtureUpdateStats,
    pub update_sub_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct FixtureValidationInput {
    pub snapshot: Fixture,
    pub summary: FixtureBatchSummary,
    pub sub_tree_proof: Vec<ProofNode>,
    pub main_tree_proof: Vec<ProofNode>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct StatLeaf {
    pub stat: ScoreStat,
    pub stat_proof: Vec<ProofNode>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct StatValidationInput {
    pub ts: i64,
    pub fixture_summary: ScoresBatchSummary,
    pub fixture_proof: Vec<ProofNode>,
    pub main_tree_proof: Vec<ProofNode>,
    pub event_stat_root: [u8; 32],
    pub stats: Vec<StatLeaf>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinaryExpression {
    Add,
    Subtract,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct TraderPredicate {
    pub threshold: i32,
    pub comparison: Comparison,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct GeometricTarget {
    pub stat_index: u8,
    pub prediction: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum StatPredicate {
    Single {
        index: u8,
        predicate: TraderPredicate,
    },
    Binary {
        index_a: u8,
        index_b: u8,
        op: BinaryExpression,
        predicate: TraderPredicate,
    },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct NDimensionalStrategy {
    pub geometric_targets: Vec<GeometricTarget>,
    pub distance_predicate: Option<TraderPredicate>,
    pub discrete_predicates: Vec<StatPredicate>,
}

#[derive(AnchorSerialize)]
pub struct ValidateStatV2Args<'a> {
    pub payload: &'a StatValidationInput,
    pub strategy: &'a NDimensionalStrategy,
}

#[derive(AnchorSerialize)]
pub struct ValidateOddsArgs<'a> {
    pub ts: i64,
    pub odds_snapshot: &'a Odds,
    pub summary: &'a OddsBatchSummary,
    pub sub_tree_proof: &'a Vec<ProofNode>,
    pub main_tree_proof: &'a Vec<ProofNode>,
}

#[derive(AnchorSerialize)]
pub struct ValidateFixtureArgs<'a> {
    pub snapshot: &'a Fixture,
    pub summary: &'a FixtureBatchSummary,
    pub sub_tree_proof: &'a Vec<ProofNode>,
    pub main_tree_proof: &'a Vec<ProofNode>,
}
