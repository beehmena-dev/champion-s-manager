export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      board_requests: {
        Row: {
          club_id: string
          created_at: string
          game_date: string
          id: string
          kind: string
          response: string
          save_id: string
          season: number
          status: string
        }
        Insert: {
          club_id: string
          created_at?: string
          game_date: string
          id?: string
          kind: string
          response?: string
          save_id: string
          season: number
          status: string
        }
        Update: {
          club_id?: string
          created_at?: string
          game_date?: string
          id?: string
          kind?: string
          response?: string
          save_id?: string
          season?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_requests_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          avg_attendance: number | null
          board_confidence: number
          budget: number
          captain_id: string | null
          competition_id: string | null
          corner_taker_id: string | null
          created_at: string
          crest_url: string | null
          defensive_line: number
          division: number
          formation: string
          founded_year: number | null
          free_kick_taker_id: string | null
          id: string
          mentality: Database["public"]["Enums"]["mentality"]
          morale: number
          name: string
          passing_style: Database["public"]["Enums"]["passing_style"]
          penalty_taker_id: string | null
          pending_override: Json | null
          player_match_goals: Json
          pressing: number
          primary_color: string | null
          reputation: number
          save_id: string
          secondary_color: string | null
          short_name: string | null
          stadium_capacity: number
          stadium_city: string | null
          stadium_name: string | null
          strength: number | null
          tactic_presets: Json
          team_fluidity: string
          tempo: number
          training_facilities: number
          training_focus: string
          training_routines: Json
          transfer_budget: number
          wage_budget: number | null
          weekly_training: Json | null
          youth_facilities: number
        }
        Insert: {
          avg_attendance?: number | null
          board_confidence?: number
          budget?: number
          captain_id?: string | null
          competition_id?: string | null
          corner_taker_id?: string | null
          created_at?: string
          crest_url?: string | null
          defensive_line?: number
          division?: number
          formation?: string
          founded_year?: number | null
          free_kick_taker_id?: string | null
          id?: string
          mentality?: Database["public"]["Enums"]["mentality"]
          morale?: number
          name: string
          passing_style?: Database["public"]["Enums"]["passing_style"]
          penalty_taker_id?: string | null
          pending_override?: Json | null
          player_match_goals?: Json
          pressing?: number
          primary_color?: string | null
          reputation?: number
          save_id: string
          secondary_color?: string | null
          short_name?: string | null
          stadium_capacity?: number
          stadium_city?: string | null
          stadium_name?: string | null
          strength?: number | null
          tactic_presets?: Json
          team_fluidity?: string
          tempo?: number
          training_facilities?: number
          training_focus?: string
          training_routines?: Json
          transfer_budget?: number
          wage_budget?: number | null
          weekly_training?: Json | null
          youth_facilities?: number
        }
        Update: {
          avg_attendance?: number | null
          board_confidence?: number
          budget?: number
          captain_id?: string | null
          competition_id?: string | null
          corner_taker_id?: string | null
          created_at?: string
          crest_url?: string | null
          defensive_line?: number
          division?: number
          formation?: string
          founded_year?: number | null
          free_kick_taker_id?: string | null
          id?: string
          mentality?: Database["public"]["Enums"]["mentality"]
          morale?: number
          name?: string
          passing_style?: Database["public"]["Enums"]["passing_style"]
          penalty_taker_id?: string | null
          pending_override?: Json | null
          player_match_goals?: Json
          pressing?: number
          primary_color?: string | null
          reputation?: number
          save_id?: string
          secondary_color?: string | null
          short_name?: string | null
          stadium_capacity?: number
          stadium_city?: string | null
          stadium_name?: string | null
          strength?: number | null
          tactic_presets?: Json
          team_fluidity?: string
          tempo?: number
          training_facilities?: number
          training_focus?: string
          training_routines?: Json
          transfer_budget?: number
          wage_budget?: number | null
          weekly_training?: Json | null
          youth_facilities?: number
        }
        Relationships: [
          {
            foreignKeyName: "clubs_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_corner_taker_id_fkey"
            columns: ["corner_taker_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_free_kick_taker_id_fkey"
            columns: ["free_kick_taker_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_penalty_taker_id_fkey"
            columns: ["penalty_taker_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          code: string
          country: string | null
          created_at: string
          current_round: number
          id: string
          name: string
          playable: boolean
          save_id: string
          season: number
          tier: number
          total_rounds: number
          type: string
        }
        Insert: {
          code: string
          country?: string | null
          created_at?: string
          current_round?: number
          id?: string
          name: string
          playable?: boolean
          save_id: string
          season?: number
          tier?: number
          total_rounds?: number
          type?: string
        }
        Update: {
          code?: string
          country?: string | null
          created_at?: string
          current_round?: number
          id?: string
          name?: string
          playable?: boolean
          save_id?: string
          season?: number
          tier?: number
          total_rounds?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_offers: {
        Row: {
          club_id: string
          contract_years: number
          created_at: string
          current_wage: number
          guaranteed_starter: boolean
          id: string
          last_actor: string
          player_id: string
          release_clause: number | null
          rounds: number
          save_id: string
          status: string
          updated_at: string
        }
        Insert: {
          club_id: string
          contract_years: number
          created_at?: string
          current_wage: number
          guaranteed_starter?: boolean
          id?: string
          last_actor: string
          player_id: string
          release_clause?: number | null
          rounds?: number
          save_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          contract_years?: number
          created_at?: string
          current_wage?: number
          guaranteed_starter?: boolean
          id?: string
          last_actor?: string
          player_id?: string
          release_clause?: number | null
          rounds?: number
          save_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_offers_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_offers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_offers_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      cup_ties: {
        Row: {
          away_club_id: string | null
          competition_id: string
          created_at: string
          home_club_id: string | null
          id: string
          is_single_leg: boolean
          leg1_match_id: string | null
          leg2_match_id: string | null
          penalty_away: number | null
          penalty_home: number | null
          resolved: boolean
          round_index: number
          round_name: string | null
          save_id: string
          season: number
          winner_club_id: string | null
        }
        Insert: {
          away_club_id?: string | null
          competition_id: string
          created_at?: string
          home_club_id?: string | null
          id?: string
          is_single_leg?: boolean
          leg1_match_id?: string | null
          leg2_match_id?: string | null
          penalty_away?: number | null
          penalty_home?: number | null
          resolved?: boolean
          round_index?: number
          round_name?: string | null
          save_id: string
          season: number
          winner_club_id?: string | null
        }
        Update: {
          away_club_id?: string | null
          competition_id?: string
          created_at?: string
          home_club_id?: string | null
          id?: string
          is_single_leg?: boolean
          leg1_match_id?: string | null
          leg2_match_id?: string | null
          penalty_away?: number | null
          penalty_home?: number | null
          resolved?: boolean
          round_index?: number
          round_name?: string | null
          save_id?: string
          season?: number
          winner_club_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cup_ties_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cup_ties_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_entries: {
        Row: {
          amount: number
          club_id: string
          created_at: string
          description: string | null
          entry_date: string
          id: string
          kind: string
          save_id: string
        }
        Insert: {
          amount: number
          club_id: string
          created_at?: string
          description?: string | null
          entry_date: string
          id?: string
          kind: string
          save_id: string
        }
        Update: {
          amount?: number
          club_id?: string
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          kind?: string
          save_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_entries_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_entries_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_messages: {
        Row: {
          body: string
          category: string
          club_id: string
          created_at: string
          game_date: string
          id: string
          link: string | null
          link_label: string | null
          read: boolean
          save_id: string
          sender: string
          subject: string
        }
        Insert: {
          body?: string
          category: string
          club_id: string
          created_at?: string
          game_date: string
          id?: string
          link?: string | null
          link_label?: string | null
          read?: boolean
          save_id: string
          sender: string
          subject: string
        }
        Update: {
          body?: string
          category?: string
          club_id?: string
          created_at?: string
          game_date?: string
          id?: string
          link?: string | null
          link_label?: string | null
          read?: boolean
          save_id?: string
          sender?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_messages_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_messages_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      job_offers: {
        Row: {
          created_at: string
          expires_date: string
          id: string
          offer_date: string
          offering_club_id: string
          save_id: string
          status: string
        }
        Insert: {
          created_at?: string
          expires_date: string
          id?: string
          offer_date: string
          offering_club_id: string
          save_id: string
          status?: string
        }
        Update: {
          created_at?: string
          expires_date?: string
          id?: string
          offer_date?: string
          offering_club_id?: string
          save_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_offers_offering_club_id_fkey"
            columns: ["offering_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_offers_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_club_id: string
          away_score: number | null
          competition_id: string
          created_at: string
          events: Json | null
          home_club_id: string
          home_score: number | null
          id: string
          match_date: string
          played: boolean
          round: number
          save_id: string
          season: number
        }
        Insert: {
          away_club_id: string
          away_score?: number | null
          competition_id: string
          created_at?: string
          events?: Json | null
          home_club_id: string
          home_score?: number | null
          id?: string
          match_date: string
          played?: boolean
          round: number
          save_id: string
          season: number
        }
        Update: {
          away_club_id?: string
          away_score?: number | null
          competition_id?: string
          created_at?: string
          events?: Json | null
          home_club_id?: string
          home_score?: number | null
          id?: string
          match_date?: string
          played?: boolean
          round?: number
          save_id?: string
          season?: number
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_club_id_fkey"
            columns: ["away_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_club_id_fkey"
            columns: ["home_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          age: number
          appearances_season: number
          attributes: Json
          bench_streak: number
          birth_date: string | null
          career_appearances: number
          career_goals: number
          club_id: string | null
          club_since: string | null
          condition: number
          contract_until: string | null
          created_at: string
          face_url: string | null
          foot: string
          form: number
          goals_season: number
          guaranteed_starter: boolean
          id: string
          individual_training_focus: string | null
          injured_until: string | null
          injury_history: Json
          injury_risk_until: string | null
          injury_type: string | null
          international_caps: number
          international_goals: number
          last_talk_date: string | null
          loan_buy_option: number | null
          loan_return_date: string | null
          loaned_from_club_id: string | null
          market_value: number
          morale: number
          name: string
          nationality: string | null
          natural_position: string | null
          overall: number
          position: string
          position_progress: Json
          potential: number | null
          release_clause: number | null
          role: string | null
          save_id: string
          scout_knowledge: number
          secondary_positions: string[]
          squad_number: number | null
          squad_tier: string
          suspended_matches: number
          wage: number
          yellow_cards_season: number
        }
        Insert: {
          age?: number
          appearances_season?: number
          attributes?: Json
          bench_streak?: number
          birth_date?: string | null
          career_appearances?: number
          career_goals?: number
          club_id?: string | null
          club_since?: string | null
          condition?: number
          contract_until?: string | null
          created_at?: string
          face_url?: string | null
          foot?: string
          form?: number
          goals_season?: number
          guaranteed_starter?: boolean
          id?: string
          individual_training_focus?: string | null
          injured_until?: string | null
          injury_history?: Json
          injury_risk_until?: string | null
          injury_type?: string | null
          international_caps?: number
          international_goals?: number
          last_talk_date?: string | null
          loan_buy_option?: number | null
          loan_return_date?: string | null
          loaned_from_club_id?: string | null
          market_value?: number
          morale?: number
          name: string
          nationality?: string | null
          natural_position?: string | null
          overall?: number
          position?: string
          position_progress?: Json
          potential?: number | null
          release_clause?: number | null
          role?: string | null
          save_id: string
          scout_knowledge?: number
          secondary_positions?: string[]
          squad_number?: number | null
          squad_tier?: string
          suspended_matches?: number
          wage?: number
          yellow_cards_season?: number
        }
        Update: {
          age?: number
          appearances_season?: number
          attributes?: Json
          bench_streak?: number
          birth_date?: string | null
          career_appearances?: number
          career_goals?: number
          club_id?: string | null
          club_since?: string | null
          condition?: number
          contract_until?: string | null
          created_at?: string
          face_url?: string | null
          foot?: string
          form?: number
          goals_season?: number
          guaranteed_starter?: boolean
          id?: string
          individual_training_focus?: string | null
          injured_until?: string | null
          injury_history?: Json
          injury_risk_until?: string | null
          injury_type?: string | null
          international_caps?: number
          international_goals?: number
          last_talk_date?: string | null
          loan_buy_option?: number | null
          loan_return_date?: string | null
          loaned_from_club_id?: string | null
          market_value?: number
          morale?: number
          name?: string
          nationality?: string | null
          natural_position?: string | null
          overall?: number
          position?: string
          position_progress?: Json
          potential?: number | null
          release_clause?: number | null
          role?: string | null
          save_id?: string
          scout_knowledge?: number
          secondary_positions?: string[]
          squad_number?: number | null
          squad_tier?: string
          suspended_matches?: number
          wage?: number
          yellow_cards_season?: number
        }
        Relationships: [
          {
            foreignKeyName: "players_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_loaned_from_club_id_fkey"
            columns: ["loaned_from_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      saves: {
        Row: {
          created_at: string
          fired_from_club_ids: string[]
          game_date: string
          id: string
          manager_name: string
          manager_reputation: number
          my_club_id: string | null
          name: string
          seeded: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fired_from_club_ids?: string[]
          game_date?: string
          id?: string
          manager_name?: string
          manager_reputation?: number
          my_club_id?: string | null
          name: string
          seeded?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fired_from_club_ids?: string[]
          game_date?: string
          id?: string
          manager_name?: string
          manager_reputation?: number
          my_club_id?: string | null
          name?: string
          seeded?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saves_my_club_fk"
            columns: ["my_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      scouting_assignments: {
        Row: {
          club_id: string
          created_at: string
          id: string
          player_id: string
          save_id: string
          started_date: string
          status: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          player_id: string
          save_id: string
          started_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          player_id?: string
          save_id?: string
          started_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouting_assignments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouting_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouting_assignments_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      season_awards: {
        Row: {
          club_id: string | null
          competition_id: string
          created_at: string
          id: string
          kind: string
          player_id: string | null
          player_name: string
          save_id: string
          season: number
          value: number
        }
        Insert: {
          club_id?: string | null
          competition_id: string
          created_at?: string
          id?: string
          kind: string
          player_id?: string | null
          player_name: string
          save_id: string
          season: number
          value: number
        }
        Update: {
          club_id?: string | null
          competition_id?: string
          created_at?: string
          id?: string
          kind?: string
          player_id?: string | null
          player_name?: string
          save_id?: string
          season?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_awards_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_awards_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_awards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_awards_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      season_history: {
        Row: {
          club_id: string
          competition_id: string
          created_at: string
          draws: number
          ga: number
          gf: number
          id: string
          losses: number
          played: number
          points: number
          position: number
          save_id: string
          season: number
          wins: number
        }
        Insert: {
          club_id: string
          competition_id: string
          created_at?: string
          draws: number
          ga: number
          gf: number
          id?: string
          losses: number
          played: number
          points: number
          position: number
          save_id: string
          season: number
          wins: number
        }
        Update: {
          club_id?: string
          competition_id?: string
          created_at?: string
          draws?: number
          ga?: number
          gf?: number
          id?: string
          losses?: number
          played?: number
          points?: number
          position?: number
          save_id?: string
          season?: number
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_history_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_history_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_history_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      season_objectives: {
        Row: {
          club_id: string
          competition_id: string
          created_at: string
          final_position: number | null
          id: string
          kind: string
          save_id: string
          season: number
          status: string
          target: number
        }
        Insert: {
          club_id: string
          competition_id: string
          created_at?: string
          final_position?: number | null
          id?: string
          kind: string
          save_id: string
          season: number
          status?: string
          target: number
        }
        Update: {
          club_id?: string
          competition_id?: string
          created_at?: string
          final_position?: number | null
          id?: string
          kind?: string
          save_id?: string
          season?: number
          status?: string
          target?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_objectives_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_objectives_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_objectives_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      seed_library: {
        Row: {
          clubs_count: number
          created_at: string
          id: string
          name: string
          players_count: number
          seed: Json
          user_id: string
        }
        Insert: {
          clubs_count?: number
          created_at?: string
          id?: string
          name: string
          players_count?: number
          seed: Json
          user_id: string
        }
        Update: {
          clubs_count?: number
          created_at?: string
          id?: string
          name?: string
          players_count?: number
          seed?: Json
          user_id?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          club_id: string | null
          created_at: string
          hired_date: string | null
          id: string
          name: string
          role: string
          save_id: string
          skill: number
          wage: number
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          hired_date?: string | null
          id?: string
          name: string
          role: string
          save_id: string
          skill?: number
          wage?: number
        }
        Update: {
          club_id?: string | null
          created_at?: string
          hired_date?: string | null
          id?: string
          name?: string
          role?: string
          save_id?: string
          skill?: number
          wage?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      tactic_lineups: {
        Row: {
          club_id: string
          created_at: string
          id: string
          instructions: Json
          is_starter: boolean
          player_id: string
          pos_x: number | null
          pos_y: number | null
          role: string | null
          save_id: string
          slot: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          instructions?: Json
          is_starter?: boolean
          player_id: string
          pos_x?: number | null
          pos_y?: number | null
          role?: string | null
          save_id: string
          slot: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          instructions?: Json
          is_starter?: boolean
          player_id?: string
          pos_x?: number | null
          pos_y?: number | null
          role?: string | null
          save_id?: string
          slot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tactic_lineups_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tactic_lineups_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tactic_lineups_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_offers: {
        Row: {
          buyer_club_id: string
          created_at: string
          current_fee: number
          deal_type: string
          expires_date: string
          id: string
          initiator: string
          last_actor: string
          loan_buy_option: number | null
          player_id: string
          rounds: number
          save_id: string
          seller_club_id: string
          status: string
          updated_at: string
        }
        Insert: {
          buyer_club_id: string
          created_at?: string
          current_fee: number
          deal_type?: string
          expires_date: string
          id?: string
          initiator: string
          last_actor: string
          loan_buy_option?: number | null
          player_id: string
          rounds?: number
          save_id: string
          seller_club_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          buyer_club_id?: string
          created_at?: string
          current_fee?: number
          deal_type?: string
          expires_date?: string
          id?: string
          initiator?: string
          last_actor?: string
          loan_buy_option?: number | null
          player_id?: string
          rounds?: number
          save_id?: string
          seller_club_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_offers_buyer_club_id_fkey"
            columns: ["buyer_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_offers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_offers_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_offers_seller_club_id_fkey"
            columns: ["seller_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_requests: {
        Row: {
          club_id: string
          created_at: string
          created_date: string
          id: string
          player_id: string
          reason: string
          save_id: string
          status: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_date: string
          id?: string
          player_id: string
          reason: string
          save_id: string
          status?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_date?: string
          id?: string
          player_id?: string
          reason?: string
          save_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          created_at: string
          fee: number
          from_club_id: string | null
          id: string
          player_id: string
          proposal_date: string
          resolved_date: string | null
          save_id: string
          status: string
          to_club_id: string | null
        }
        Insert: {
          created_at?: string
          fee?: number
          from_club_id?: string | null
          id?: string
          player_id: string
          proposal_date: string
          resolved_date?: string | null
          save_id: string
          status?: string
          to_club_id?: string | null
        }
        Update: {
          created_at?: string
          fee?: number
          from_club_id?: string | null
          id?: string
          player_id?: string
          proposal_date?: string
          resolved_date?: string | null
          save_id?: string
          status?: string
          to_club_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_club_id_fkey"
            columns: ["from_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "saves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_club_id_fkey"
            columns: ["to_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_uid: { Args: never; Returns: string }
      owns_save: { Args: { _save_id: string }; Returns: boolean }
      rollover_background_players: {
        Args: { p_next_season_start: string; p_save_id: string }
        Returns: undefined
      }
    }
    Enums: {
      mentality: "defensive" | "balanced" | "attacking"
      passing_style: "short" | "mixed" | "direct"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      mentality: ["defensive", "balanced", "attacking"],
      passing_style: ["short", "mixed", "direct"],
    },
  },
} as const
