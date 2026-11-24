#property strict
#property version "1.00"
#include <Trade/Trade.mqh>

enum RiskMode { CashRisk, PercentRisk, FixedLots };
input ENUM_TIMEFRAMES EntryTimeframe = PERIOD_M5;
input RiskMode Sizing = CashRisk;
input double CashPerTrade = 25;
input double BalanceRiskPercent = 0.25;
input double Lots = 0.01;
input double BuyReward = 3;
input double SellReward = 2;
input int FractalWing = 2;
input int MinimumBodyPoints = 10;
input int StopBufferPoints = 5;
input int MaximumSpreadPoints = 30;
input int SetupBars = 6;
input int PendingBars = 6;
input bool UseSessions = true;
input int LondonStart = 8;
input int LondonEnd = 12;
input int NewYorkStart = 13;
input int NewYorkEnd = 17;
input double DailyLossLimit = 100;
input int DailyOrderLimit = 3;
input bool EnableBuy = true;
input bool EnableSell = true;
input bool ShowDashboard = true;
input ulong Magic = 482197;

CTrade trade;
datetime lastBar, sweptHigh, sweptLow, highTime, lowTime, sweepTime;
double highLevel, lowLevel, dayEquity, lastLots;
int direction, dayKey, dailyOrders;

int OnInit()
{
   if(!MQLInfoInteger(MQL_TESTER))
   {
      Print("Trendproof Sweep runs in MT5 Strategy Tester.");
      return INIT_FAILED;
   }
   if(FractalWing < 1 || FractalWing > 20 || SetupBars < 1 || PendingBars < 1 ||
      MinimumBodyPoints < 0 || StopBufferPoints < 1 || MaximumSpreadPoints < 1 ||
      BuyReward <= 0 || SellReward <= 0 || DailyLossLimit <= 0 || DailyOrderLimit < 1 ||
      (Sizing == CashRisk && CashPerTrade <= 0) ||
      (Sizing == PercentRisk && (BalanceRiskPercent <= 0 || BalanceRiskPercent > 100)) ||
      (Sizing == FixedLots && Lots <= 0) ||
      LondonStart < 0 || LondonStart > 23 || NewYorkStart < 0 || NewYorkStart > 23 ||
      LondonEnd < 0 || LondonEnd > 24 || NewYorkEnd < 0 || NewYorkEnd > 24)
      return INIT_PARAMETERS_INCORRECT;
   trade.SetExpertMagicNumber(Magic);
   return INIT_SUCCEEDED;
}

bool InHours(int hour, int start, int end)
{
   return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

void FindFractals(datetime asOf)
{
   MqlRates hourly[];
   ArraySetAsSeries(hourly,true);
   int shift = iBarShift(_Symbol,PERIOD_H1,asOf);
   if(shift < 0) return;
   int count = CopyRates(_Symbol,PERIOD_H1,shift+1,120,hourly);
   bool foundHigh = false, foundLow = false;
   for(int i=FractalWing; i<count-FractalWing && !(foundHigh && foundLow); i++)
   {
      bool top = true, bottom = true;
      for(int j=1; j<=FractalWing; j++)
      {
         top = top && hourly[i].high > hourly[i-j].high && hourly[i].high > hourly[i+j].high;
         bottom = bottom && hourly[i].low < hourly[i-j].low && hourly[i].low < hourly[i+j].low;
      }
      if(top && !foundHigh) { highLevel=hourly[i].high; highTime=hourly[i].time; foundHigh=true; }
      if(bottom && !foundLow) { lowLevel=hourly[i].low; lowTime=hourly[i].time; foundLow=true; }
   }
}

bool Busy(bool cancel)
{
   bool busy = PositionSelect(_Symbol);
   for(int i=OrdersTotal()-1; i>=0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0 || OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      busy=true;
      if(cancel && (ulong)OrderGetInteger(ORDER_MAGIC)==Magic)
      {
         if(!trade.OrderDelete(ticket) || trade.ResultRetcode()!=TRADE_RETCODE_DONE)
            Print("Cancellation failed: ",trade.ResultRetcodeDescription());
      }
   }
   return busy;
}

double PositionSize(bool buy, double entry, double stop)
{
   double volume = Lots;
   if(Sizing != FixedLots)
   {
      double result;
      if(!OrderCalcProfit(buy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL,_Symbol,1.0,entry,stop,result)
         || result >= 0) return 0;
      double budget = Sizing == CashRisk ? CashPerTrade
                      : AccountInfoDouble(ACCOUNT_BALANCE)*BalanceRiskPercent/100;
      volume = budget/(-result);
   }
   double step = SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   if(step <= 0) return 0;
   volume = MathMin(volume,SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX));
   volume = NormalizeDouble(MathFloor(volume/step+1e-9)*step,8);
   return volume >= SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN) ? volume : 0;
}

void DrawPrice(string name,double price,color shade)
{
   if(!MQLInfoInteger(MQL_VISUAL_MODE)) return;
   name="Trendproof "+name;
   if(ObjectFind(0,name)<0) ObjectCreate(0,name,OBJ_HLINE,0,0,price);
   ObjectSetDouble(0,name,OBJPROP_PRICE,price);
   ObjectSetInteger(0,name,OBJPROP_COLOR,shade);
}

void PlaceSetup(bool buy,const MqlRates &candle,datetime now)
{
   MqlTick quote;
   if(!SymbolInfoTick(_Symbol,quote) || (quote.ask-quote.bid)/_Point > MaximumSpreadPoints) return;
   double step = SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(step <= 0) return;
   double entry = NormalizeDouble(MathRound((candle.open+candle.close)/2/step)*step,_Digits);
   double edge = buy ? candle.low-StopBufferPoints*_Point : candle.high+StopBufferPoints*_Point;
   double stop = NormalizeDouble((buy ? MathFloor(edge/step) : MathCeil(edge/step))*step,_Digits);
   double distance = MathAbs(entry-stop);
   double target = entry+(buy ? BuyReward : -SellReward)*distance;
   target = NormalizeDouble(MathRound(target/step)*step,_Digits);
   double minimum = SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point;
   if(distance < minimum || MathAbs(target-entry) < minimum ||
      (buy ? quote.ask-entry : entry-quote.bid) <= minimum) return;
   double volume = PositionSize(buy,entry,stop);
   if(volume <= 0) return;
   datetime expiry = now+PendingBars*PeriodSeconds(EntryTimeframe);
   bool sent = buy ? trade.BuyLimit(volume,entry,_Symbol,stop,target,ORDER_TIME_SPECIFIED,expiry,"Trendproof Sweep")
                   : trade.SellLimit(volume,entry,_Symbol,stop,target,ORDER_TIME_SPECIFIED,expiry,"Trendproof Sweep");
   uint code=trade.ResultRetcode();
   if(!sent || (code!=TRADE_RETCODE_PLACED && code!=TRADE_RETCODE_DONE))
   {
      Print("Limit order rejected: ",trade.ResultRetcodeDescription());
      return;
   }
   dailyOrders++;
   lastLots=volume;
   DrawPrice("Engulfing open",candle.open,clrSlateGray);
   DrawPrice("Engulfing close",candle.close,clrSlateGray);
   DrawPrice("Entry",entry,clrDodgerBlue);
   DrawPrice("Stop",stop,clrTomato);
   DrawPrice("Target",target,clrSeaGreen);
}

void OnTick()
{
   datetime now=TimeCurrent();
   MqlDateTime clock;
   TimeToStruct(now,clock);
   int key=clock.year*1000+clock.day_of_year;
   double equity=AccountInfoDouble(ACCOUNT_EQUITY);
   if(key!=dayKey) { dayKey=key; dailyOrders=0; dayEquity=equity; direction=0; }
   bool session=!UseSessions || InHours(clock.hour,LondonStart,LondonEnd) ||
                InHours(clock.hour,NewYorkStart,NewYorkEnd);
   bool loss=dayEquity-equity>=DailyLossLimit;
   bool busy=Busy(loss || !session);
   if(ShowDashboard && MQLInfoInteger(MQL_VISUAL_MODE))
      Comment("Trendproof Sweep | Strategy Tester\nBalance: ",DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE),2),
              "  Session P/L: ",DoubleToString(equity-dayEquity,2),
              "\nLast lot size: ",DoubleToString(lastLots,4),"  Orders today: ",dailyOrders,
              "  Position: ",PositionSelect(_Symbol) ? "open" : "flat",
              "\nRisk limit: ",DoubleToString(DailyLossLimit,2),"  Account currency: ",AccountInfoString(ACCOUNT_CURRENCY));
   datetime current=iTime(_Symbol,EntryTimeframe,0);
   if(current==0 || current==lastBar) return;
   MqlRates bars[];
   ArraySetAsSeries(bars,true);
   if(CopyRates(_Symbol,EntryTimeframe,1,2,bars)!=2) return;
   lastBar=current;
   if(!session || loss || busy || dailyOrders>=DailyOrderLimit) { direction=0; return; }

   FindFractals(bars[0].time);
   bool lower=EnableBuy && lowTime>0 && lowTime!=sweptLow &&
              bars[0].low<lowLevel && bars[0].close>lowLevel;
   bool upper=EnableSell && highTime>0 && highTime!=sweptHigh &&
              bars[0].high>highLevel && bars[0].close<highLevel;
   if(lower) sweptLow=lowTime;
   if(upper) sweptHigh=highTime;
   if(lower || upper)
   {
      direction=lower==upper ? 0 : (lower ? 1 : -1);
      sweepTime=bars[0].time;
      if(direction!=0) DrawPrice("Sweep",lower ? lowLevel : highLevel,clrGold);
      return;
   }
   if(direction==0 || iBarShift(_Symbol,EntryTimeframe,sweepTime)>SetupBars+1)
   { direction=0; return; }

   bool bull=bars[1].close<bars[1].open && bars[0].close>bars[0].open &&
             bars[0].open<=bars[1].close && bars[0].close>=bars[1].open;
   bool bear=bars[1].close>bars[1].open && bars[0].close<bars[0].open &&
             bars[0].open>=bars[1].close && bars[0].close<=bars[1].open;
   if(MathAbs(bars[0].close-bars[0].open)<MinimumBodyPoints*_Point) return;
   if((direction==1 && bull) || (direction==-1 && bear))
   {
      PlaceSetup(direction==1,bars[0],now);
      direction=0;
   }
}
